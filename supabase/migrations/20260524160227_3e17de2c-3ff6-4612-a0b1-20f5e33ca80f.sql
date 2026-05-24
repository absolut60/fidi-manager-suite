DROP POLICY IF EXISTS "Richieste: insert autenticati" ON public.richieste_fido;

CREATE POLICY "Richieste: insert store o admin"
  ON public.richieste_fido
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by = auth.uid())
    AND (
      public.has_role(auth.uid(), 'amministratore'::app_role)
      OR public.has_role(auth.uid(), 'store_manager'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    )
  );