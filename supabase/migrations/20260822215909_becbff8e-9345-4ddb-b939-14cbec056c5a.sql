REVOKE EXECUTE ON FUNCTION public.invia_push_da_notifica() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invia_push_da_notifica() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invia_push_da_notifica() FROM anon;
GRANT EXECUTE ON FUNCTION public.invia_push_da_notifica() TO service_role;