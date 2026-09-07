CREATE OR REPLACE FUNCTION public.get_stato_opt_out(_emails text[])
RETURNS TABLE(email text, disiscritto boolean, origine text, campagna_nome text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT DISTINCT lower(trim(e)) AS email
    FROM unnest(coalesce(_emails, ARRAY[]::text[])) AS e
    WHERE e IS NOT NULL AND trim(e) <> ''
  ),
  ultima AS (
    SELECT DISTINCT ON (lower(trim(o.email)))
      lower(trim(o.email)) AS email,
      o.origine,
      cam.nome AS campagna_nome,
      o.created_at
    FROM public.marketing_opt_out o
    LEFT JOIN public.campagne_email_marketing cam ON cam.id = o.campagna_id
    WHERE lower(trim(o.email)) IN (SELECT i.email FROM input i)
    ORDER BY lower(trim(o.email)), o.created_at DESC
  )
  SELECT
    i.email,
    (u.email IS NOT NULL) AS disiscritto,
    u.origine,
    u.campagna_nome,
    u.created_at
  FROM input i
  LEFT JOIN ultima u ON u.email = i.email;
$$;

GRANT EXECUTE ON FUNCTION public.get_stato_opt_out(text[]) TO authenticated, service_role, supabase_read_only_user;