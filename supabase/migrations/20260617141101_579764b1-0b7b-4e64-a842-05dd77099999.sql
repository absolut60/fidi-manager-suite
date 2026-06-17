
-- UPDATE: allarga al richiedente in qualsiasi stato
DROP POLICY IF EXISTS "Richieste: update admin/amministrazione/autore-bozza/approvator" ON public.richieste_fido;

CREATE POLICY "Richieste: update admin/amministrazione/autore/approvatori"
ON public.richieste_fido
FOR UPDATE
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR created_by = auth.uid()
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

-- DELETE: admin/amministrazione + richiedente sulle proprie
DROP POLICY IF EXISTS "Richieste: delete admin o amministrazione" ON public.richieste_fido;

CREATE POLICY "Richieste: delete admin/amministrazione/autore"
ON public.richieste_fido
FOR DELETE
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR created_by = auth.uid()
);
