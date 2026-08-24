CREATE OR REPLACE FUNCTION public.get_utenti_chat()
RETURNS TABLE(id uuid, nome text, cognome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.nome, p.cognome
  FROM public.profili p
  WHERE p.attivo = true AND p.id <> auth.uid()
  ORDER BY p.cognome, p.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_utenti_chat() TO supabase_read_only_user;
