CREATE OR REPLACE FUNCTION public.get_nomi_utenti()
RETURNS TABLE(id uuid, nome text, cognome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome::text, p.cognome::text FROM public.profili p
$$;

COMMENT ON FUNCTION public.get_nomi_utenti() IS 'Fonte unica per mostrare il nome di altri utenti (solo id, nome, cognome; anche profili non attivi per lo storico). Solo utenti autenticati.';

REVOKE EXECUTE ON FUNCTION public.get_nomi_utenti() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nomi_utenti() TO authenticated, service_role;