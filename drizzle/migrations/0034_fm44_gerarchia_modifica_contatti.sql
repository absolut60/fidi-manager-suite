CREATE OR REPLACE FUNCTION public.auth_puo_modificare_contatto(_cliente_id uuid, _lead_id uuid, _created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    has_role(auth.uid(),'amministratore'::app_role)
    OR (has_role(auth.uid(),'responsabile_agenti'::app_role) AND _created_by = auth.uid())
    OR has_role(auth.uid(),'marketing'::app_role)
    OR (_cliente_id IS NOT NULL AND (
         auth_gestisce_contatti_clienti()
         OR (has_role(auth.uid(),'agente'::app_role) AND user_can_access_cliente(_cliente_id))
         OR (has_role(auth.uid(),'responsabile_agenti'::app_role) AND EXISTS (SELECT 1 FROM clienti c WHERE c.id = _cliente_id AND c.codice_agente IS NOT NULL))
         OR EXISTS (
              SELECT 1 FROM clienti c JOIN profili p ON p.id = auth.uid()
              WHERE c.id = _cliente_id AND p.store_id IS NOT NULL AND c.store_id = p.store_id
                AND (_created_by IS NULL OR _created_by = auth.uid()
                     OR EXISTS (SELECT 1 FROM profili a WHERE a.id = _created_by AND a.store_id = p.store_id))
            )
       ))
    OR (_cliente_id IS NULL AND _lead_id IS NOT NULL AND (has_lead_module_access(auth.uid()) OR agente_vede_record(NULL::text, NULL::uuid, NULL::uuid, _lead_id, NULL::uuid)))
$$;

CREATE OR REPLACE FUNCTION public.contatti_modificabili_ids(_cliente_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT id FROM contatti WHERE cliente_id = _cliente_id AND auth_puo_modificare_contatto(cliente_id, lead_id, created_by)
$$;

REVOKE EXECUTE ON FUNCTION public.auth_puo_modificare_contatto(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_modificare_contatto(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.contatti_modificabili_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contatti_modificabili_ids(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente" ON public.contatti
  FOR UPDATE TO authenticated
  USING (public.auth_puo_modificare_contatto(cliente_id, lead_id, created_by))
  WITH CHECK (public.auth_puo_modificare_contatto(cliente_id, lead_id, created_by));
COMMENT ON POLICY "Contatti: update come il cliente" ON public.contatti IS 'FM44 parte 2: gerarchia di modifica dei contatti. Fonte unica public.auth_puo_modificare_contatto(cliente_id, lead_id, created_by).';