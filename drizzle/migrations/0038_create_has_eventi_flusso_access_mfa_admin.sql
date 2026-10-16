CREATE OR REPLACE FUNCTION public.has_eventi_flusso_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('amministrazione','direzione','marketing','responsabile_agenti','marketing_eventi')
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'amministratore'
    )
    AND (_user_id IS DISTINCT FROM auth.uid() OR public.auth_mfa_ok())
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_eventi_flusso_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_eventi_flusso_access(uuid) TO service_role;

COMMENT ON FUNCTION public.has_eventi_flusso_access(uuid) IS 'FM44: accesso flusso eventi; ramo amministratore richiede auth_mfa_ok quando _user_id = auth.uid()';