
CREATE POLICY "richieste_allegati_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'richieste-allegati'
    AND public.user_can_access_richiesta_interna(
      (regexp_replace(split_part(name, '/', 1), '.*', '\&'))::uuid
    )
  );

CREATE POLICY "richieste_allegati_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'richieste-allegati'
    AND public.user_can_access_richiesta_interna(
      (split_part(name, '/', 1))::uuid
    )
  );

CREATE POLICY "richieste_allegati_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'richieste-allegati'
    AND public.user_can_access_richiesta_interna(
      (split_part(name, '/', 1))::uuid
    )
  );

CREATE POLICY "richieste_allegati_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'richieste-allegati'
    AND (
      public.has_role(auth.uid(),'amministratore')
      OR owner = auth.uid()
    )
    AND public.user_can_access_richiesta_interna(
      (split_part(name, '/', 1))::uuid
    )
  );
