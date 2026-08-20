REVOKE EXECUTE ON FUNCTION public.trg_ricalcola_in_gestione_legale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_ricalcola_in_gestione_legale() TO service_role;