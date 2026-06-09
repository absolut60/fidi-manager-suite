
CREATE POLICY "Import staging: select admin/approvatori"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'import-staging'
  AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

CREATE POLICY "Import staging: insert admin/approvatori"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'import-staging'
  AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

CREATE POLICY "Import staging: update admin/approvatori"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'import-staging'
  AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'import-staging'
  AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

CREATE POLICY "Import staging: delete admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'import-staging'
  AND has_role(auth.uid(), 'amministratore'::app_role)
);

DROP POLICY IF EXISTS "Utenti aggiornano il proprio profilo" ON public.profili;

CREATE POLICY "Utenti aggiornano il proprio profilo"
ON public.profili FOR UPDATE
USING (
  auth.uid() = id
  OR has_role(auth.uid(), 'amministratore'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    auth.uid() = id
    AND store_id IS NOT DISTINCT FROM (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);
