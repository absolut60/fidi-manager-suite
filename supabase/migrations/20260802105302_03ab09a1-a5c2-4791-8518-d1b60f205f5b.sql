CREATE OR REPLACE FUNCTION public.get_utenti_assegnabili()
RETURNS TABLE(id uuid, nome text, cognome text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_lead(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome, p.cognome
    FROM public.profili p
    WHERE p.attivo = true
    ORDER BY p.cognome, p.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.get_utenti_assegnabili() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_utenti_assegnabili() TO authenticated;