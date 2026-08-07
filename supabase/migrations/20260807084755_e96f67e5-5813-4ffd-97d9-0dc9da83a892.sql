REVOKE EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) TO authenticated, service_role, postgres;