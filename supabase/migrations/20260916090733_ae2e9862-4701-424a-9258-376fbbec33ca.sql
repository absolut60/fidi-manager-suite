CREATE OR REPLACE FUNCTION public.has_eventi_flusso_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('amministratore','amministrazione','direzione','marketing','responsabile_agenti','marketing_eventi')
  )
$$;

REVOKE ALL ON FUNCTION public.has_eventi_flusso_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_eventi_flusso_access(uuid) TO authenticated, service_role;