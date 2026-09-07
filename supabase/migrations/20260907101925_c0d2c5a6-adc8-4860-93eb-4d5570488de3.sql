CREATE OR REPLACE FUNCTION public.get_conteggi_campagne_email()
RETURNS TABLE (
  campagna_id uuid,
  totale bigint,
  da_inviare bigint,
  inviato bigint,
  fallito bigint,
  saltato bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.campagna_id,
         count(*) AS totale,
         count(*) FILTER (WHERE d.stato_invio = 'da_inviare') AS da_inviare,
         count(*) FILTER (WHERE d.stato_invio = 'inviato')    AS inviato,
         count(*) FILTER (WHERE d.stato_invio = 'fallito')    AS fallito,
         count(*) FILTER (WHERE d.stato_invio NOT IN ('da_inviare','inviato','fallito')) AS saltato
  FROM public.campagne_email_destinatari d
  GROUP BY d.campagna_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_conteggi_campagne_email() TO authenticated, service_role, supabase_read_only_user;