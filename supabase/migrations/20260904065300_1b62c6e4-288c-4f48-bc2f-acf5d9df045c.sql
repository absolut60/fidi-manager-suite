DROP POLICY IF EXISTS allegati_storage_insert ON storage.objects;
DROP POLICY IF EXISTS allegati_storage_select ON storage.objects;

CREATE POLICY allegati_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'allegati')
    AND (owner = auth.uid())
    AND (
      (
        split_part(name, '/', 1) = 'richiesta_fido'
        AND user_can_access_richiesta_fido(
          (NULLIF(split_part(name, '/', 2), ''))::uuid
        )
      )
      OR user_can_access_cliente(allegato_storage_path_cliente_id(name))
      OR has_role(auth.uid(), 'amministratore')
      OR has_role(auth.uid(), 'amministrazione')
      OR has_role(auth.uid(), 'direzione')
      OR (
        split_part(name, '/', 1) = 'campagna_email'
        AND (
          has_role(auth.uid(), 'amministratore')
          OR has_role(auth.uid(), 'amministrazione')
          OR has_role(auth.uid(), 'direzione')
          OR has_role(auth.uid(), 'marketing')
        )
      )
      OR (
        split_part(name, '/', 1) = 'task'
        AND user_puo_accedere_task(
          (NULLIF(split_part(name, '/', 2), ''))::uuid,
          auth.uid()
        )
      )
      OR (
        split_part(name, '/', 1) = 'messaggio'
        AND user_puo_accedere_messaggio(
          (NULLIF(split_part(name, '/', 2), ''))::uuid,
          auth.uid()
        )
      )
    )
  );

CREATE POLICY allegati_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (bucket_id = 'allegati')
    AND (
      EXISTS (
        SELECT 1
        FROM public.allegati a
        WHERE a.storage_path = objects.name
          AND (
            has_role(auth.uid(), 'amministratore')
            OR (
              a.cliente_id IS NOT NULL
              AND user_can_access_cliente(a.cliente_id)
            )
            OR (
              a.entita_tipo = 'campagna_email'
              AND (
                has_role(auth.uid(), 'amministratore')
                OR has_role(auth.uid(), 'amministrazione')
                OR has_role(auth.uid(), 'direzione')
                OR has_role(auth.uid(), 'marketing')
              )
            )
            OR (
              a.entita_tipo = 'task'
              AND user_puo_accedere_task(a.entita_id, auth.uid())
            )
            OR (
              a.entita_tipo = 'messaggio'
              AND user_puo_accedere_messaggio(a.entita_id, auth.uid())
            )
          )
      )
      OR (
        split_part(name, '/', 1) = 'task'
        AND user_puo_accedere_task(
          (NULLIF(split_part(name, '/', 2), ''))::uuid,
          auth.uid()
        )
      )
      OR (
        split_part(name, '/', 1) = 'messaggio'
        AND user_puo_accedere_messaggio(
          (NULLIF(split_part(name, '/', 2), ''))::uuid,
          auth.uid()
        )
      )
    )
  );