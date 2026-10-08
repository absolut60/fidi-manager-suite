CREATE OR REPLACE FUNCTION public.auth_puo_inviare_recupero()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'recupero_crediti'::public.app_role)
      OR public.has_role(auth.uid(), 'amministratore'::public.app_role);
$$;
COMMENT ON FUNCTION public.auth_puo_inviare_recupero() IS
  'Chi può inviare comunicazioni di recupero al cliente (sollecito, email libera, lettera, invio massivo). Gemello TypeScript: src/lib/recupero-permessi.ts.';
REVOKE ALL ON FUNCTION public.auth_puo_inviare_recupero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_inviare_recupero() TO authenticated, service_role;