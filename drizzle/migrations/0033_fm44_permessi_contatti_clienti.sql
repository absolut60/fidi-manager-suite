CREATE OR REPLACE FUNCTION public.auth_gestisce_contatti_clienti()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('recupero_crediti','amministrazione','direzione'));
$$;

CREATE OR REPLACE FUNCTION public.auth_puo_eliminare_contatti_clienti()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('amministratore','recupero_crediti'));
$$;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_contatti_cliente(_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(auth.uid(),'responsabile_agenti'::app_role)
    OR user_can_write_cliente(_cliente_id)
    OR (has_role(auth.uid(),'agente'::app_role) AND user_can_access_cliente(_cliente_id))
    OR (has_role(auth.uid(),'marketing'::app_role) AND _cliente_id IS NOT NULL)
    OR (_cliente_id IS NOT NULL AND auth_gestisce_contatti_clienti());
$$;

REVOKE EXECUTE ON FUNCTION public.auth_gestisce_contatti_clienti() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_puo_eliminare_contatti_clienti() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_puo_scrivere_contatti_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_gestisce_contatti_clienti() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_puo_eliminare_contatti_clienti() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_contatti_cliente(uuid) TO authenticated, service_role;

DROP POLICY "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente" ON public.contatti FOR INSERT TO authenticated
WITH CHECK (
  auth_puo_scrivere_contatti_cliente(cliente_id)
  OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
  OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL::text, NULL::uuid, NULL::uuid, lead_id, NULL::uuid))
);

DROP POLICY "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente" ON public.contatti FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND (created_by = auth.uid())) OR user_can_write_cliente(cliente_id) OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id)) OR has_role(auth.uid(), 'marketing'::app_role) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL::text, NULL::uuid, NULL::uuid, lead_id, NULL::uuid))
  OR (cliente_id IS NOT NULL AND (SELECT auth_gestisce_contatti_clienti()))
)
WITH CHECK (
  (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND (created_by = auth.uid())) OR user_can_write_cliente(cliente_id) OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id)) OR (has_role(auth.uid(), 'marketing'::app_role) AND (cliente_id IS NOT NULL)) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL::text, NULL::uuid, NULL::uuid, lead_id, NULL::uuid))
  OR (cliente_id IS NOT NULL AND (SELECT auth_gestisce_contatti_clienti()))
);

DROP POLICY "Contatti: delete admin" ON public.contatti;
CREATE POLICY "Contatti: delete admin" ON public.contatti FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
  OR (cliente_id IS NOT NULL AND (SELECT auth_puo_eliminare_contatti_clienti()))
);

COMMENT ON POLICY "Contatti: insert come il cliente" ON public.contatti IS 'FM44: parte cliente da auth_puo_scrivere_contatti_cliente(cliente_id) (fonte unica, usata anche dall''interfaccia); include auth_gestisce_contatti_clienti().';
COMMENT ON POLICY "Contatti: update come il cliente" ON public.contatti IS 'FM44: aggiunto ramo cliente_id IS NOT NULL AND auth_gestisce_contatti_clienti() (recupero_crediti, amministrazione, direzione).';
COMMENT ON POLICY "Contatti: delete admin" ON public.contatti IS 'FM44: aggiunto ramo cliente_id IS NOT NULL AND auth_puo_eliminare_contatti_clienti() (amministratore, recupero_crediti).';