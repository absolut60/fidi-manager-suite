CREATE OR REPLACE FUNCTION public.get_clienti_disiscritti_ids(_modo text)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH disiscritti AS (
    SELECT c.id
    FROM clienti c
    WHERE c.email IS NOT NULL
      AND lower(btrim(c.email)) IN (SELECT lower(m.email) FROM marketing_opt_out m)
  )
  SELECT d.id FROM disiscritti d
  WHERE _modo = 'disiscritti'
  UNION ALL
  SELECT c.id FROM clienti c
  WHERE _modo = 'non_disiscritti'
    AND c.id NOT IN (SELECT id FROM disiscritti);
$function$;

GRANT EXECUTE ON FUNCTION public.get_clienti_disiscritti_ids(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_disiscritti_ids(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clienti_disiscritti_ids(text) TO supabase_read_only_user;