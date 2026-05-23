ALTER FUNCTION public.calcola_livello_fido(numeric) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.calcola_livello_fido(numeric) TO authenticated, anon, service_role;