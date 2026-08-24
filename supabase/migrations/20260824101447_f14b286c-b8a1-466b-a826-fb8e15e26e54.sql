REVOKE EXECUTE ON FUNCTION public.get_utenti_chat() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_utenti_chat() FROM anon;

GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO supabase_read_only_user;
