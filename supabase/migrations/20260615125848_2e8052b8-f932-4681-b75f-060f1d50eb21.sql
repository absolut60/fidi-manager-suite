
-- comunicazioni_richiesta: scope to authenticated
ALTER POLICY "Comunicazioni: delete autore o admin" ON public.comunicazioni_richiesta TO authenticated;
ALTER POLICY "Comunicazioni: update autore o admin" ON public.comunicazioni_richiesta TO authenticated;

-- pratiche_legali_allegati select
ALTER POLICY "Allegati pratiche: select store manager via cliente" ON public.pratiche_legali_allegati TO authenticated;

-- storico_pratiche_legali
ALTER POLICY "Storico pratiche: delete admin" ON public.storico_pratiche_legali TO authenticated;
ALTER POLICY "Storico pratiche: insert admin/approvatori" ON public.storico_pratiche_legali TO authenticated;
ALTER POLICY "Storico pratiche: update admin" ON public.storico_pratiche_legali TO authenticated;

-- storage.objects: add UPDATE policy for allegati bucket mirroring SELECT
CREATE POLICY "allegati_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'allegati' AND EXISTS (
      SELECT 1 FROM public.allegati a
      WHERE a.storage_path = storage.objects.name
        AND (
          public.has_role(auth.uid(), 'amministratore'::public.app_role)
          OR (a.cliente_id IS NOT NULL AND public.user_can_access_cliente(a.cliente_id))
        )
    )
  )
  WITH CHECK (
    bucket_id = 'allegati' AND EXISTS (
      SELECT 1 FROM public.allegati a
      WHERE a.storage_path = storage.objects.name
        AND (
          public.has_role(auth.uid(), 'amministratore'::public.app_role)
          OR (a.cliente_id IS NOT NULL AND public.user_can_access_cliente(a.cliente_id))
        )
    )
  );
