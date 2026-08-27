CREATE OR REPLACE FUNCTION public.get_dashboard_fatturato(_store_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(tipo text, anno integer, num_clienti bigint, num_fatture bigint, fatturato numeric, ytd_alla_data date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(_store_id) AS s),
  cl AS MATERIALIZED (
    SELECT c.id FROM public.clienti c CROSS JOIN eff
    WHERE eff.s IS NULL OR c.store_id = eff.s
  ),
  docs AS MATERIALIZED (
    SELECT DISTINCT ON (s.cliente_id, COALESCE(s.key_documento, s.numero_documento))
      s.cliente_id, s.data_documento, s.importo_documento AS importo_doc
    FROM public.scadenze s
    JOIN cl ON cl.id = s.cliente_id
    WHERE s.data_documento IS NOT NULL AND s.numero_documento IS NOT NULL
    ORDER BY s.cliente_id, COALESCE(s.key_documento, s.numero_documento), s.data_documento
  ),
  oggi AS (SELECT CURRENT_DATE AS d,
                  EXTRACT(month FROM CURRENT_DATE)::int AS m,
                  EXTRACT(day FROM CURRENT_DATE)::int AS gg)
  SELECT 'annuale'::text, EXTRACT(year FROM d.data_documento)::int,
         count(DISTINCT d.cliente_id), count(*)::bigint,
         round(sum(d.importo_doc)/1.22, 2), NULL::date
  FROM docs d
  GROUP BY 2
  UNION ALL
  SELECT 'ytd'::text, EXTRACT(year FROM d.data_documento)::int,
         count(DISTINCT d.cliente_id), count(*)::bigint,
         round(sum(d.importo_doc)/1.22, 2), (SELECT o.d FROM oggi o)
  FROM docs d CROSS JOIN oggi o
  WHERE EXTRACT(month FROM d.data_documento)::int < o.m
     OR (EXTRACT(month FROM d.data_documento)::int = o.m AND EXTRACT(day FROM d.data_documento)::int <= o.gg)
  GROUP BY 2;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_fatturato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fatturato(uuid) TO authenticated, service_role;