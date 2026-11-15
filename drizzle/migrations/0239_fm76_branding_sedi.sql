ALTER TABLE public.stores ADD COLUMN logo_email_path text NULL, ADD COLUMN logo_pdf_path text NULL;
COMMENT ON COLUMN public.stores.logo_email_path IS 'FM76: percorso nel bucket branding del logo email della sede.';
COMMENT ON COLUMN public.stores.logo_pdf_path IS 'FM76: percorso nel bucket branding del logo PDF della sede.';
-- La policy UPDATE esistente "Solo admin gestisce stores - update" usa has_role(auth.uid(), amministratore),
-- con WITH CHECK implicito uguale a USING; la restrittiva MFA resta invariata. Non occorre aggiungere policy stores.
-- Bucket creato tramite Storage API, limite 1 MB. Pubblicazione bloccata dalla policy workspace:
-- temporaneamente privato, lettura autenticata amministratore; quando pubblico il download pubblico non richiede SELECT RLS.
CREATE POLICY "Branding: lettura amministratore" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'branding' AND (SELECT public.has_role(auth.uid(), 'amministratore')));
CREATE POLICY "Branding: inserimento amministratore" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND (SELECT public.has_role(auth.uid(), 'amministratore'))
AND name ~ '^sedi/[0-9a-fA-F-]{36}/logo-(email|pdf)\.png$'
AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = split_part(name, '/', 2)));
CREATE POLICY "Branding: sostituzione amministratore" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND (SELECT public.has_role(auth.uid(), 'amministratore')))
WITH CHECK (bucket_id = 'branding' AND (SELECT public.has_role(auth.uid(), 'amministratore'))
AND name ~ '^sedi/[0-9a-fA-F-]{36}/logo-(email|pdf)\.png$'
AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = split_part(name, '/', 2)));
CREATE POLICY "Branding: rimozione amministratore" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND (SELECT public.has_role(auth.uid(), 'amministratore')));