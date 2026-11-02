-- FM55 fetta 9: fonte unica dei fidi approvati ed esportati che Gamma non ha ancora recepito.
-- Gemello TS: fetchFidiInAttesaGamma (src/lib/fido-teorico.ts). Usata da proposta massiva, Alert fidi, scheda cliente.
-- SECURITY DEFINER solo per leggere audit_log (riservato agli amministratori); il perimetro clienti
-- dell'utente è riapplicato qui: ruoli globali tutto, altrimenti clienti_ambito_utente_ids().
CREATE OR REPLACE FUNCTION public.fidi_approvati_in_attesa_gamma(_cliente_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(cliente_id uuid, richiesta_id uuid, importo_approvato numeric, data_export timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT DISTINCT ON (r.cliente_id) r.cliente_id, r.id, r.importo_approvato::numeric AS imp, r.data_export
    FROM public.richieste_fido r
    WHERE r.stato::text = 'approvata'
      AND r.esito_fido IS DISTINCT FROM 'rifiutata'
      AND r.importo_approvato IS NOT NULL
      AND r.data_export IS NOT NULL
      AND (_cliente_ids IS NULL OR r.cliente_id = ANY(_cliente_ids))
      AND (auth.uid() IS NULL OR public.auth_ha_ruolo_globale_clienti()
           OR r.cliente_id IN (SELECT public.clienti_ambito_utente_ids()))
    ORDER BY r.cliente_id, COALESCE(r.data_approvazione, r.data_chiusura) DESC NULLS LAST, r.data_export DESC
  )
  SELECT r.cliente_id, r.id, r.imp, r.data_export
  FROM r JOIN public.clienti c ON c.id = r.cliente_id
  WHERE r.imp IS DISTINCT FROM c.fido_gestionale::numeric
    AND NOT EXISTS (
      SELECT 1 FROM public.audit_log a
      WHERE a.entita = 'cliente' AND a.entita_id = r.cliente_id
        AND a.created_at > r.data_export
        AND (a.dettagli -> 'campi') ? 'fido_gestionale'
    )
$function$;

REVOKE EXECUTE ON FUNCTION public.fidi_approvati_in_attesa_gamma(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fidi_approvati_in_attesa_gamma(uuid[]) TO authenticated, service_role;