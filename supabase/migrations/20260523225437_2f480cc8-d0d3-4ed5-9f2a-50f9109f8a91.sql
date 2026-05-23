CREATE OR REPLACE VIEW public.fatturato_clienti AS
SELECT
  cliente_id,
  EXTRACT(YEAR FROM data_documento)::int AS anno,
  COUNT(*) AS num_fatture,
  SUM(importo_doc) AS fatturato
FROM (
  SELECT DISTINCT ON (cliente_id, numero_documento, sezionale)
    cliente_id,
    data_documento,
    importo_documento AS importo_doc,
    numero_documento,
    sezionale
  FROM public.scadenze
  WHERE data_documento IS NOT NULL
    AND numero_documento IS NOT NULL
  ORDER BY cliente_id, numero_documento, sezionale, data_documento
) sub
GROUP BY cliente_id, EXTRACT(YEAR FROM data_documento)::int;

CREATE OR REPLACE VIEW public.fatturato_annuale_globale AS
SELECT
  anno,
  COUNT(DISTINCT cliente_id) AS num_clienti,
  COUNT(*) AS num_fatture_totali,
  SUM(fatturato) AS fatturato_totale
FROM public.fatturato_clienti
GROUP BY anno
ORDER BY anno DESC;