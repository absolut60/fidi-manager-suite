ALTER TABLE public.alert_fidi ADD COLUMN IF NOT EXISTS confermato_da uuid;
ALTER TABLE public.alert_fidi ADD COLUMN IF NOT EXISTS confermato_il timestamptz;

-- Conferma di un alert "extra non usato" aperto: si ripresenta dopo alert_fidi_extra_giorni.
-- Visibilità: gemella della policy "Visibilità clienti per ruolo" su public.clienti + secondo fattore.
CREATE OR REPLACE FUNCTION public.conferma_extra_alert_fido(_alert_id uuid)
RETURNS public.alert_fidi
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_alert public.alert_fidi;
  v_gg int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Operazione non consentita'; END IF;
  IF NOT public.auth_mfa_ok() THEN RAISE EXCEPTION 'Serve il secondo fattore di accesso'; END IF;

  SELECT a.* INTO v_alert FROM public.alert_fidi a WHERE a.id = _alert_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avviso non trovato'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clienti c
    WHERE c.id = v_alert.cliente_id
      AND ( public.auth_ha_ruolo_globale_clienti()
         OR public.has_role(v_uid, 'marketing'::app_role)
         OR public.has_role(v_uid, 'marketing_eventi'::app_role)
         OR (c.store_id IS NOT NULL AND c.store_id = public.profilo_store_id_corrente())
         OR (c.codice_agente IS NOT NULL AND c.codice_agente = public.agente_codice_corrente()))
  ) THEN
    RAISE EXCEPTION 'Avviso non trovato';
  END IF;

  IF v_alert.tipo <> 'extra_non_usato' OR v_alert.stato <> 'aperto' THEN
    RAISE EXCEPTION 'Si possono confermare solo gli avvisi di extra non usato aperti';
  END IF;

  SELECT COALESCE(NULLIF(trim(valore),'')::int, 30) INTO v_gg
  FROM public.configurazioni WHERE chiave = 'alert_fidi_extra_giorni';
  v_gg := COALESCE(v_gg, 30);

  UPDATE public.alert_fidi SET
    stato = 'confermato',
    riproponi_dal = current_date + v_gg,
    confermato_da = v_uid,
    confermato_il = now(),
    aggiornato_il = now()
  WHERE id = _alert_id
  RETURNING * INTO v_alert;
  RETURN v_alert;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.conferma_extra_alert_fido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferma_extra_alert_fido(uuid) TO authenticated, service_role;