
REVOKE EXECUTE ON FUNCTION public.marca_messaggi_letti(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_richieste_con_messaggi_non_letti() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marca_messaggi_letti(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_richieste_con_messaggi_non_letti() TO authenticated;
