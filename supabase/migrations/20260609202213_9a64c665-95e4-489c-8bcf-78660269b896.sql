
-- Restrict policies to authenticated role for clarity/safety

-- public.esportazioni
DROP POLICY IF EXISTS "Esportazioni: update admin/approvatori" ON public.esportazioni;
CREATE POLICY "Esportazioni: update admin/approvatori" ON public.esportazioni
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role));

-- public.reminder
DROP POLICY IF EXISTS "Reminder: insert scoped" ON public.reminder;
CREATE POLICY "Reminder: insert scoped" ON public.reminder
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role) OR ((utente_id = auth.uid()) AND ((cliente_id IS NULL) OR user_can_access_cliente(cliente_id))));

-- storage.objects
DROP POLICY IF EXISTS "Import files: update admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: update admin/approvatori" ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'import-files'::text) AND (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)))
  WITH CHECK ((bucket_id = 'import-files'::text) AND (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)));

DROP POLICY IF EXISTS "Pratiche legali storage: update admin/approvatori" ON storage.objects;
CREATE POLICY "Pratiche legali storage: update admin/approvatori" ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'pratiche-legali'::text) AND (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)))
  WITH CHECK ((bucket_id = 'pratiche-legali'::text) AND (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)));

DROP POLICY IF EXISTS "PrivacyPdf: insert admin scoped" ON storage.objects;
CREATE POLICY "PrivacyPdf: insert admin scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'privacy-pdf'::text) AND has_role(auth.uid(), 'amministratore'::app_role) AND ((storage_path_cliente_id(name) IS NULL) OR user_can_write_cliente(storage_path_cliente_id(name))));

DROP POLICY IF EXISTS "PrivacyPdf: update admin scoped" ON storage.objects;
CREATE POLICY "PrivacyPdf: update admin scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'privacy-pdf'::text) AND has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK ((bucket_id = 'privacy-pdf'::text) AND has_role(auth.uid(), 'amministratore'::app_role) AND ((storage_path_cliente_id(name) IS NULL) OR user_can_write_cliente(storage_path_cliente_id(name))));
