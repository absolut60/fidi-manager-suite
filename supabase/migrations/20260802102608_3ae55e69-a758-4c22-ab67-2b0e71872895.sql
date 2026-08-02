DROP POLICY IF EXISTS email_assets_campagne_select ON storage.objects;
CREATE POLICY email_assets_campagne_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'email-assets' AND (storage.foldername(name))[1] = 'campagne' AND public.can_manage_email_assets());

DROP POLICY IF EXISTS richieste_allegati_insert ON storage.objects;
CREATE POLICY richieste_allegati_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'richieste-allegati'
    AND owner = auth.uid()
    AND public.user_can_access_richiesta_interna((split_part(name, '/', 1))::uuid)
  );