
DROP POLICY IF EXISTS "Assicurazioni: scrittura admin/approvatori" ON public.assicurazioni_credito;
CREATE POLICY "Assicurazioni: scrittura admin/approvatori/amm/dir"
ON public.assicurazioni_credito
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

DROP POLICY IF EXISTS "Pratiche legali: scrittura admin/approvatori" ON public.pratiche_legali;
CREATE POLICY "Pratiche legali: scrittura admin/approvatori/amm/dir"
ON public.pratiche_legali
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
);
