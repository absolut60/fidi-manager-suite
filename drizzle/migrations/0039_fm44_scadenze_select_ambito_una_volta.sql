CREATE OR REPLACE FUNCTION public.clienti_ambito_utente_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.clienti c
  WHERE (c.store_id IS NOT NULL AND c.store_id = public.profilo_store_id_corrente())
     OR (c.codice_agente IS NOT NULL AND c.codice_agente = public.agente_codice_corrente())
$$;

COMMENT ON FUNCTION public.clienti_ambito_utente_ids() IS 'FM44: id dei clienti visibili per ambito (negozio/agente) all''utente corrente. Gemello documentato del ramo negozio/agente di user_can_access_cliente: se cambia una, cambia l''altra.';

REVOKE EXECUTE ON FUNCTION public.clienti_ambito_utente_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clienti_ambito_utente_ids() TO authenticated, service_role;

DROP POLICY "Scadenze: select come il cliente" ON public.scadenze;
CREATE POLICY "Scadenze: select come il cliente" ON public.scadenze
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()));

COMMENT ON POLICY "Scadenze: select come il cliente" ON public.scadenze IS 'FM44: controlli sull''utente calcolati una volta per query. Equivale a user_can_access_cliente(cliente_id); ramo ambito nel gemello clienti_ambito_utente_ids().';