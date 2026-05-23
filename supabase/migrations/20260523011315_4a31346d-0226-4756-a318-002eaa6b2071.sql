-- 1) Rimuovi duplicati su (cliente_id, numero_documento, sezionale) mantenendo il record più recente
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY cliente_id, numero_documento, sezionale
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.scadenze
)
DELETE FROM public.scadenze s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 2) Indice UNIQUE con NULLS NOT DISTINCT così le righe con NULL vengono trattate come uguali
CREATE UNIQUE INDEX IF NOT EXISTS scadenze_cliente_doc_sez_uniq
  ON public.scadenze (cliente_id, numero_documento, sezionale) NULLS NOT DISTINCT;