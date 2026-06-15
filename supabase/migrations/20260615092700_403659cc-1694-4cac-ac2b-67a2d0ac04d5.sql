DROP POLICY IF EXISTS "Esportazioni: select admin/approvatori" ON public.esportazioni;
DROP POLICY IF EXISTS "Esportazioni: insert admin/approvatori" ON public.esportazioni;
DROP POLICY IF EXISTS "Esportazioni: update admin/approvatori" ON public.esportazioni;

CREATE POLICY "Esportazioni: select admin/approvatori/amministrazione"
ON public.esportazioni
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::public.app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
);

CREATE POLICY "Esportazioni: insert admin/approvatori/amministrazione"
ON public.esportazioni
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::public.app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
);

CREATE POLICY "Esportazioni: update admin/approvatori/amministrazione"
ON public.esportazioni
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::public.app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::public.app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
  OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
);