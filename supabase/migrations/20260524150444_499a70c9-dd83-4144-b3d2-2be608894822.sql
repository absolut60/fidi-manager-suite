
-- 1. import-files UPDATE policy
CREATE POLICY "Import files: update admin/approvatori"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'import-files' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

-- 2. pratiche-legali UPDATE policy
CREATE POLICY "Pratiche legali storage: update admin/approvatori"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'pratiche-legali' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'pratiche-legali' AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
);

-- 3. privacy-pdf: tighten INSERT to verify cliente ownership, add UPDATE policy
DROP POLICY IF EXISTS "PrivacyPdf: insert admin" ON storage.objects;
CREATE POLICY "PrivacyPdf: insert admin scoped"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
  AND (
    storage_path_cliente_id(name) IS NULL
    OR user_can_write_cliente(storage_path_cliente_id(name))
  )
);

CREATE POLICY "PrivacyPdf: update admin scoped"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
)
WITH CHECK (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
  AND (
    storage_path_cliente_id(name) IS NULL
    OR user_can_write_cliente(storage_path_cliente_id(name))
  )
);

-- 4. Reminder INSERT: allow any authenticated user (incl. store_manager) to
--    insert reminders for themselves, restricted to clients they can access.
DROP POLICY IF EXISTS "Reminder: insert con utente_id corretto" ON public.reminder;
CREATE POLICY "Reminder: insert scoped"
ON public.reminder FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    utente_id = auth.uid()
    AND (
      cliente_id IS NULL
      OR user_can_access_cliente(cliente_id)
    )
  )
);
