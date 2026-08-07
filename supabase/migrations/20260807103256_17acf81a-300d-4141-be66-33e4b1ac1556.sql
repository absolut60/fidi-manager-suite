CREATE OR REPLACE FUNCTION public.get_dashboard_fidi_aggregati()
RETURNS TABLE(
  tipo text,
  chiave text,
  etichetta text,
  ordine int,
  n_clienti bigint,
  n_clienti_con_fido bigint,
  fido_concesso_eur numeric,
  fido_proposto_eur numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(NULL) AS sid),
  cl AS (
    SELECT c.id, c.store_id, COALESCE(c.fido_gestionale, 0) AS concesso
    FROM public.clienti c CROSS JOIN eff
    WHERE eff.sid IS NULL OR c.store_id = eff.sid
  ),
  ft AS (SELECT cliente_id, COALESCE(fido_proposto, 0) AS proposto FROM public.get_fido_teorico()),
  base AS (
    SELECT cl.id, cl.store_id, cl.concesso, COALESCE(ft.proposto, 0) AS proposto
    FROM cl LEFT JOIN ft ON ft.cliente_id = cl.id
  ),
  per_sede AS (
    SELECT
      'sede'::text AS tipo,
      COALESCE(b.store_id::text, 'nessuna') AS chiave,
      COALESCE(s.nome, 'Senza sede') AS etichetta,
      0 AS ordine,
      COUNT(*)::bigint AS n_clienti,
      COUNT(*) FILTER (WHERE b.concesso > 0)::bigint AS n_clienti_con_fido,
      COALESCE(SUM(b.concesso), 0) AS fido_concesso_eur,
      COALESCE(SUM(b.proposto), 0) AS fido_proposto_eur
    FROM base b
    LEFT JOIN public.stores s ON s.id = b.store_id
    GROUP BY b.store_id, s.nome
  ),
  fascia_calc AS (
    SELECT
      CASE
        WHEN b.concesso <= 0 THEN 0
        WHEN b.concesso <= 500 THEN 1
        WHEN b.concesso <= 1000 THEN 2
        WHEN b.concesso <= 2500 THEN 3
        WHEN b.concesso <= 5000 THEN 4
        WHEN b.concesso <= 10000 THEN 5
        WHEN b.concesso <= 25000 THEN 6
        WHEN b.concesso <= 50000 THEN 7
        ELSE 8
      END AS ordine,
      b.concesso, b.proposto
    FROM base b
  ),
  per_fascia AS (
    SELECT
      'fascia'::text AS tipo,
      (ARRAY['nessuno','0_500','501_1000','1001_2500','2501_5000','5001_10000','10001_25000','25001_50000','oltre_50000'])[fc.ordine + 1] AS chiave,
      (ARRAY['Nessun fido','Fino a 500 €','501 - 1.000 €','1.001 - 2.500 €','2.501 - 5.000 €','5.001 - 10.000 €','10.001 - 25.000 €','25.001 - 50.000 €','Oltre 50.000 €'])[fc.ordine + 1] AS etichetta,
      fc.ordine,
      COUNT(*)::bigint AS n_clienti,
      COUNT(*) FILTER (WHERE fc.concesso > 0)::bigint AS n_clienti_con_fido,
      COALESCE(SUM(fc.concesso), 0) AS fido_concesso_eur,
      COALESCE(SUM(fc.proposto), 0) AS fido_proposto_eur
    FROM fascia_calc fc
    GROUP BY fc.ordine
  )
  SELECT * FROM per_sede
  UNION ALL
  SELECT * FROM per_fascia
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_fidi_aggregati() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi_aggregati() TO authenticated, service_role;