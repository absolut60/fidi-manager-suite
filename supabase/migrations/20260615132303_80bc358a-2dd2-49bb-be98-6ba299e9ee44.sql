
-- Tabella allegati: policy DELETE
DROP POLICY IF EXISTS allegati_delete ON public.allegati;
CREATE POLICY allegati_delete ON public.allegati
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR caricato_da = auth.uid()
  );

-- Tabella allegati: policy UPDATE (creata per coerenza)
DROP POLICY IF EXISTS allegati_update ON public.allegati;
CREATE POLICY allegati_update ON public.allegati
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR caricato_da = auth.uid()
  )
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR caricato_da = auth.uid()
  );

-- Storage bucket "allegati": policy DELETE
DROP POLICY IF EXISTS allegati_storage_delete ON storage.objects;
CREATE POLICY allegati_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'allegati'
    AND (
      owner = auth.uid()
      OR has_role(auth.uid(), 'amministratore'::app_role)
      OR has_role(auth.uid(), 'amministrazione'::app_role)
    )
  );
