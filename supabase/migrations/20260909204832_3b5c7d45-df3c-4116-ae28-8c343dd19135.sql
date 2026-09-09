CREATE OR REPLACE FUNCTION public.classifica_iscritti_whatsapp_batch(_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    jsonb_agg(public.classifica_iscritto_whatsapp(x.id)),
    '[]'::jsonb
  )
  FROM (SELECT DISTINCT unnest(_ids) AS id) x;
$function$;

GRANT EXECUTE ON FUNCTION public.classifica_iscritti_whatsapp_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_iscritti_whatsapp_batch(uuid[]) TO service_role;