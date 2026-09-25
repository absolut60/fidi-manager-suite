CREATE OR REPLACE FUNCTION public.profilo_store_id_corrente()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid() LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.profilo_store_id_corrente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profilo_store_id_corrente() TO authenticated, service_role;

DROP POLICY "Visibilità clienti per ruolo" ON public.clienti;
CREATE POLICY "Visibilità clienti per ruolo" ON public.clienti
FOR SELECT TO authenticated
USING (
  (SELECT public.auth_ha_ruolo_globale_clienti())
  OR (SELECT public.has_role((SELECT auth.uid()), 'marketing'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'marketing_eventi'::app_role))
  OR (store_id IS NOT NULL AND store_id = (SELECT public.profilo_store_id_corrente()))
  OR (codice_agente IS NOT NULL AND codice_agente = (SELECT public.agente_codice_corrente()))
);

COMMENT ON POLICY "Visibilità clienti per ruolo" ON public.clienti IS
'Gemello inline (per prestazioni) del fast-path di user_can_access_cliente(id, store_id, codice_agente): ruoli globali, marketing, stesso negozio del profilo, agente con proprio codice. Se cambia la regola in user_can_access_cliente va cambiata anche qui (FM35).';