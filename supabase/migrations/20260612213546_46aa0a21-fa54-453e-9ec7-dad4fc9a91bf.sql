
DROP POLICY IF EXISTS "Import staging: select admin/approvatori" ON storage.objects;
DROP POLICY IF EXISTS "Import staging: insert admin/approvatori" ON storage.objects;
DROP POLICY IF EXISTS "Import staging: update admin/approvatori" ON storage.objects;
DROP POLICY IF EXISTS "Import staging: delete admin" ON storage.objects;

CREATE POLICY "Import staging: select admin/approvatori"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'import-staging' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
);

CREATE POLICY "Import staging: insert admin/approvatori"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'import-staging' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
);

CREATE POLICY "Import staging: update admin/approvatori"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'import-staging' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'import-staging' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
);

CREATE POLICY "Import staging: delete admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'import-staging'
  AND public.has_role(auth.uid(), 'amministratore'::public.app_role)
);
