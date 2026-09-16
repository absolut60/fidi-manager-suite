DROP POLICY "Modulo lead gestisce le righe import eventi" ON public.eventi_import_righe;
CREATE POLICY "Modulo lead gestisce le righe import eventi" ON public.eventi_import_righe FOR ALL TO authenticated USING (has_eventi_flusso_access(auth.uid())) WITH CHECK (has_eventi_flusso_access(auth.uid()));

DROP POLICY "Importazioni: select admin/approvatori" ON public.importazioni;
CREATE POLICY "Importazioni: select admin/approvatori" ON public.importazioni FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)) OR (has_eventi_flusso_access(auth.uid()) AND fonte = 'eventi_partecipanti'));

DROP POLICY "Importazioni: insert admin/approvatori" ON public.importazioni;
CREATE POLICY "Importazioni: insert admin/approvatori" ON public.importazioni FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)) OR (has_eventi_flusso_access(auth.uid()) AND fonte = 'eventi_partecipanti'));

DROP POLICY "Import files: select admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: select admin/approvatori" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'import-files'::text AND ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)) OR (has_eventi_flusso_access(auth.uid()) AND (storage.foldername(name))[1] = 'eventi')));

DROP POLICY "Import files: insert admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: insert admin/approvatori" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'import-files'::text AND ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)) OR (has_eventi_flusso_access(auth.uid()) AND (storage.foldername(name))[1] = 'eventi')));

DROP POLICY "lead_select" ON public.lead;
CREATE POLICY "lead_select" ON public.lead FOR SELECT TO authenticated USING (has_lead_module_access(auth.uid()) OR has_eventi_flusso_access(auth.uid()));

DROP POLICY "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente" ON public.contatti FOR SELECT TO authenticated USING (user_can_access_cliente(cliente_id) OR has_role(auth.uid(), 'marketing'::app_role) OR (cliente_id IS NULL AND lead_id IS NOT NULL AND (has_lead_module_access(auth.uid()) OR has_eventi_flusso_access(auth.uid()))));

DROP POLICY "Visibilità clienti per ruolo" ON public.clienti;
CREATE POLICY "Visibilità clienti per ruolo" ON public.clienti FOR SELECT TO authenticated USING (auth_ha_ruolo_globale_clienti() OR has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'marketing_eventi'::app_role) OR user_can_access_cliente(id, store_id, codice_agente));