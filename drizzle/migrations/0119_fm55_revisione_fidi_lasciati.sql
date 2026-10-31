-- FM55 fetta 2: "Lascia così 30 giorni" per ogni cliente in revisione (con o senza alert).
CREATE TABLE public.revisione_fidi_lasciati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  fido_gamma numeric NOT NULL,
  deciso_da uuid NOT NULL DEFAULT auth.uid(),
  deciso_da_nome text,
  deciso_il timestamptz NOT NULL DEFAULT now(),
  valido_fino date NOT NULL
);
CREATE INDEX revisione_fidi_lasciati_cliente_idx ON public.revisione_fidi_lasciati (cliente_id, deciso_il DESC);

REVOKE ALL ON public.revisione_fidi_lasciati FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.revisione_fidi_lasciati TO authenticated;
GRANT ALL ON public.revisione_fidi_lasciati TO service_role;
ALTER TABLE public.revisione_fidi_lasciati ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura lasciati così: solo clienti visibili" ON public.revisione_fidi_lasciati
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = revisione_fidi_lasciati.cliente_id));
CREATE POLICY "Inserimento lasciati così: clienti visibili, decisore = utente" ON public.revisione_fidi_lasciati
  FOR INSERT TO authenticated
  WITH CHECK (deciso_da = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = revisione_fidi_lasciati.cliente_id));
CREATE POLICY "Secondo fattore (FM44)" ON public.revisione_fidi_lasciati
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));

CREATE OR REPLACE FUNCTION public.lascia_cosi_revisione(_cliente_id uuid)
RETURNS public.revisione_fidi_lasciati
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
REVOKE EXECUTE ON FUNCTION public.lascia_cosi_revisione(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lascia_cosi_revisione(uuid) TO authenticated, service_role;