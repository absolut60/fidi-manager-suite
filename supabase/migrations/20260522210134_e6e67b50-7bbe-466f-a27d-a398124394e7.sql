-- Public buckets serve files via direct URL; remove SELECT policies on storage.objects
-- that enable listing all files in the 'firme' bucket.
DROP POLICY IF EXISTS "Firme: lettura pubblica" ON storage.objects;
DROP POLICY IF EXISTS "Firme: autenticati leggono" ON storage.objects;
DROP POLICY IF EXISTS "Firme: select autenticati" ON storage.objects;
DROP POLICY IF EXISTS "firme public read" ON storage.objects;

-- Keep a narrow authenticated SELECT only for admins (for management/audit),
-- not for anon users. Public read continues to work via direct object URLs.
CREATE POLICY "Firme: admin elenca"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'firme' AND has_role(auth.uid(), 'amministratore'::app_role));