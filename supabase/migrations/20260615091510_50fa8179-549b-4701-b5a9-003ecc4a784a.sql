DROP POLICY IF EXISTS "Importazioni: select admin/approvatori" ON public.importazioni;
CREATE POLICY "Importazioni: select admin/approvatori"
ON public.importazioni FOR SELECT
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Importazioni: insert admin/approvatori" ON public.importazioni;
CREATE POLICY "Importazioni: insert admin/approvatori"
ON public.importazioni FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Importazioni: update admin/approvatori" ON public.importazioni;
CREATE POLICY "Importazioni: update admin/approvatori"
ON public.importazioni FOR UPDATE
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Import files: select admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: select admin/approvatori"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

DROP POLICY IF EXISTS "Import files: insert admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: insert admin/approvatori"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

DROP POLICY IF EXISTS "Import files: update admin/approvatori" ON storage.objects;
CREATE POLICY "Import files: update admin/approvatori"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

DROP POLICY IF EXISTS "Import staging: select admin/approvatori" ON storage.objects;
CREATE POLICY "Import staging: select admin/approvatori"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'import-staging' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

DROP POLICY IF EXISTS "Import staging: insert admin/approvatori" ON storage.objects;
CREATE POLICY "Import staging: insert admin/approvatori"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'import-staging' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

DROP POLICY IF EXISTS "Import staging: update admin/approvatori" ON storage.objects;
CREATE POLICY "Import staging: update admin/approvatori"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'import-staging' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'import-staging' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);