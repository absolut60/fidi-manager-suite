DROP POLICY IF EXISTS "Admin e approvatori vedono tutti i clienti" ON public.clienti;

CREATE POLICY "Visibilità clienti per ruolo"
ON public.clienti FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR store_id IN (
    SELECT store_id FROM public.profili WHERE id = auth.uid()
  )
  OR (
    created_by = auth.uid()
    AND (codice_gestionale IS NULL OR codice_gestionale = '')
  )
);