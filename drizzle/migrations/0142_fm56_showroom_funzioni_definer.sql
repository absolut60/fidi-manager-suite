-- FM56 S1-bis: funzioni SECURITY DEFINER chiuse al ruolo solo-showroom. Corpi da pg_get_functiondef, modificata solo la guardia.

CREATE OR REPLACE FUNCTION public.conferma_alert_fido(_alert_id uuid)
 RETURNS alert_fidi
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_alert public.alert_fidi;
  v_gg int;
BEGIN
  IF (SELECT public.auth_solo_showroom()) THEN RAISE EXCEPTION 'Operazione non consentita' USING ERRCODE='42501'; END IF;
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

  IF v_alert.tipo NOT IN ('consumo', 'extra_non_usato') OR v_alert.stato <> 'aperto' THEN
    RAISE EXCEPTION 'Si possono lasciare così solo gli avvisi di consumo o di extra non usato aperti';
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

CREATE OR REPLACE FUNCTION public.lascia_cosi_revisione(_cliente_id uuid)
 RETURNS revisione_fidi_lasciati
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fido numeric;
  v_gg int;
  v_nome text;
  v_riga public.revisione_fidi_lasciati;
  v_alert uuid;
BEGIN
  IF (SELECT public.auth_solo_showroom()) THEN RAISE EXCEPTION 'Operazione non consentita' USING ERRCODE='42501'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Operazione non consentita'; END IF;
  IF NOT public.auth_mfa_ok() THEN RAISE EXCEPTION 'Serve il secondo fattore di accesso'; END IF;

  SELECT COALESCE(c.fido_gestionale, 0) INTO v_fido
  FROM public.clienti c
  WHERE c.id = _cliente_id
    AND ( public.auth_ha_ruolo_globale_clienti()
       OR public.has_role(v_uid, 'marketing'::app_role)
       OR public.has_role(v_uid, 'marketing_eventi'::app_role)
       OR (c.store_id IS NOT NULL AND c.store_id = public.profilo_store_id_corrente())
       OR (c.codice_agente IS NOT NULL AND c.codice_agente = public.agente_codice_corrente()));
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;

  SELECT COALESCE(NULLIF(trim(valore),'')::int, 30) INTO v_gg
  FROM public.configurazioni WHERE chiave = 'alert_fidi_extra_giorni';
  v_gg := COALESCE(v_gg, 30);

  SELECT NULLIF(trim(concat_ws(' ', p.nome, p.cognome)), '') INTO v_nome FROM public.profili p WHERE p.id = v_uid;

  INSERT INTO public.revisione_fidi_lasciati (cliente_id, fido_gamma, deciso_da, deciso_da_nome, valido_fino)
  VALUES (_cliente_id, v_fido, v_uid, v_nome, current_date + v_gg)
  RETURNING * INTO v_riga;

  -- Alert lasciabili (consumo / extra non usato aperti, senza richiesta attiva): logica esistente.
  FOR v_alert IN
    SELECT a.id FROM public.alert_fidi a
    WHERE a.cliente_id = _cliente_id AND a.tipo IN ('consumo','extra_non_usato') AND a.stato = 'aperto'
      AND NOT EXISTS (SELECT 1 FROM public.richieste_fido r WHERE r.cliente_id = _cliente_id
        AND public.richiesta_fido_attiva(r.stato::text, r.stato_export))
  LOOP
    PERFORM public.conferma_alert_fido(v_alert);
  END LOOP;

  RETURN v_riga;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crea_cantiere_lite(_cliente_id uuid, _nome text, _indirizzo text DEFAULT NULL::text, _citta text DEFAULT NULL::text, _provincia text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new_id uuid;
BEGIN
  IF NOT (public.auth_ha_accesso_preventivi() OR (public.user_can_access_cliente(_cliente_id) AND NOT (SELECT public.auth_solo_showroom()))) THEN
    RAISE EXCEPTION 'Permesso negato per creare cantieri su questo cliente';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Il nome del cantiere è obbligatorio';
  END IF;
  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id obbligatorio';
  END IF;
  INSERT INTO public.cantieri (cliente_id, nome, indirizzo, citta, provincia, attivo, created_by)
  VALUES (
    _cliente_id,
    btrim(_nome),
    NULLIF(btrim(COALESCE(_indirizzo,'')), ''),
    NULLIF(btrim(COALESCE(_citta,'')), ''),
    NULLIF(btrim(COALESCE(_provincia,'')), ''),
    true,
    auth.uid()
  )
  RETURNING cantieri.id INTO _new_id;
  RETURN QUERY SELECT _new_id, btrim(_nome);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.conferma_alert_fido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferma_alert_fido(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.lascia_cosi_revisione(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lascia_cosi_revisione(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lascia_cosi_revisione(uuid) TO supabase_read_only_user;
