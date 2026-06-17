
DROP POLICY IF EXISTS "Richieste: update admin/amministrazione/autore/approvatori" ON public.richieste_fido;
CREATE POLICY "Richieste: update admin/amministrazione/autore/approvatori"
ON public.richieste_fido
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR created_by = auth.uid()
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Richieste: delete admin/amministrazione/autore" ON public.richieste_fido;
CREATE POLICY "Richieste: delete admin/amministrazione/autore"
ON public.richieste_fido
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR created_by = auth.uid()
);
