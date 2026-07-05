CREATE OR REPLACE VIEW public.fatturato_annuale_globale AS
SELECT
  anno,
  count(DISTINCT cliente_id) AS num_clienti,
  COALESCE(sum(num_fatture), 0)::bigint AS num_fatture_totali,
  sum(fatturato) AS fatturato_totale
FROM public.fatturato_clienti
GROUP BY anno
ORDER BY anno DESC;

GRANT SELECT ON public.fatturato_annuale_globale TO authenticated;
GRANT SELECT ON public.fatturato_annuale_globale TO anon;
GRANT ALL ON public.fatturato_annuale_globale TO service_role;

CREATE OR REPLACE VIEW public.fatturato_ytd_globale AS
WITH docs AS (
  SELECT DISTINCT ON (s.cliente_id, COALESCE(s.key_documento, s.numero_documento))
    s.cliente_id,
    s.data_documento,
    s.importo_documento AS importo_doc,
    s.numero_documento,
    s.key_documento
  FROM public.scadenze s
  WHERE s.data_documento IS NOT NULL
    AND s.numero_documento IS NOT NULL
  ORDER BY s.cliente_id, COALESCE(s.key_documento, s.numero_documento), s.data_documento
),
oggi AS (
  SELECT
    CURRENT_DATE AS d,
    EXTRACT(MONTH FROM CURRENT_DATE)::int AS m,
    EXTRACT(DAY FROM CURRENT_DATE)::int AS gg
)
SELECT
  EXTRACT(YEAR FROM d.data_documento)::int AS anno,
  count(DISTINCT d.cliente_id) AS num_clienti,
  count(*)::bigint AS num_fatture,
  ROUND((sum(d.importo_doc) / 1.22)::numeric, 2) AS fatturato,
  (SELECT o.d FROM oggi o) AS ytd_alla_data
FROM docs d, oggi
WHERE (EXTRACT(MONTH FROM d.data_documento)::int < oggi.m)
   OR (EXTRACT(MONTH FROM d.data_documento)::int = oggi.m
       AND EXTRACT(DAY FROM d.data_documento)::int <= oggi.gg)
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.fatturato_ytd_globale TO authenticated;
GRANT SELECT ON public.fatturato_ytd_globale TO anon;
GRANT ALL ON public.fatturato_ytd_globale TO service_role;