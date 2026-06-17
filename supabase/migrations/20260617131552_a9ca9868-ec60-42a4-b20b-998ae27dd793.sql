
DROP POLICY IF EXISTS "Richieste: update admin o autore in bozza" ON public.richieste_fido;
CREATE POLICY "Richieste: update admin/amministrazione/autore-bozza/approvatori"
ON public.richieste_fido FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR (created_by = auth.uid() AND stato = 'bozza'::stato_richiesta)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Richieste: delete solo admin" ON public.richieste_fido;
CREATE POLICY "Richieste: delete admin o amministrazione"
ON public.richieste_fido FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
);
