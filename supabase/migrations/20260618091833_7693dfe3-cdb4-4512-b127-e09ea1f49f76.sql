
-- 1) Drop view dipendenti dalla colonna sezionale (verranno ricreate dopo)
DROP VIEW IF EXISTS public.fatturato_annuale_globale;
DROP VIEW IF EXISTS public.fatturato_clienti;

-- 2) Reset distruttivo accettato: PRIMA dello schema, per evitare conflitti su indice unico
DELETE FROM public.reminder WHERE scadenza_id IS NOT NULL;
TRUNCATE TABLE public.scadenze RESTART IDENTITY CASCADE;

-- 3) Drop vecchio indice unico
DROP INDEX IF EXISTS public.scadenze_cliente_doc_sez_anno_datascad_uniq;

-- 4) Rimuovi colonna sezionale (sezionale ora dentro numero_documento)
ALTER TABLE public.scadenze DROP COLUMN IF EXISTS sezionale;

-- 5) Nuove colonne dal tracciato MADE_VISTASCADENZE
ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS key_documento text,
  ADD COLUMN IF NOT EXISTS key_tipo_effetto integer,
  ADD COLUMN IF NOT EXISTS data_pagamento_effettiva date;

-- 6) Nuovo indice unico = chiave di upsert
CREATE UNIQUE INDEX IF NOT EXISTS scadenze_key_uniq
  ON public.scadenze (cliente_id, key_documento, data_scadenza, key_tipo_effetto, importo_scadenza)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_scadenze_key_documento
  ON public.scadenze (key_documento);

-- 7) Ricrea view fatturato_clienti usando key_documento al posto di sezionale
CREATE VIEW public.fatturato_clienti AS
SELECT
  cliente_id,
  EXTRACT(year FROM data_documento)::integer AS anno,
  count(*) AS num_fatture,
  round(sum(importo_doc) / 1.22, 2) AS fatturato
FROM (
  SELECT DISTINCT ON (scadenze.cliente_id, COALESCE(scadenze.key_documento, scadenze.numero_documento))
    scadenze.cliente_id,
    scadenze.data_documento,
    scadenze.importo_documento AS importo_doc,
    scadenze.numero_documento,
    scadenze.key_documento
  FROM public.scadenze
  WHERE scadenze.data_documento IS NOT NULL
    AND scadenze.numero_documento IS NOT NULL
  ORDER BY scadenze.cliente_id, COALESCE(scadenze.key_documento, scadenze.numero_documento), scadenze.data_documento
) sub
GROUP BY cliente_id, EXTRACT(year FROM data_documento)::integer;

GRANT SELECT ON public.fatturato_clienti TO authenticated;
GRANT ALL ON public.fatturato_clienti TO service_role;

CREATE VIEW public.fatturato_annuale_globale AS
SELECT
  anno,
  count(DISTINCT cliente_id) AS num_clienti,
  count(*) AS num_fatture_totali,
  sum(fatturato) AS fatturato_totale
FROM public.fatturato_clienti
GROUP BY anno
ORDER BY anno DESC;

GRANT SELECT ON public.fatturato_annuale_globale TO authenticated;
GRANT ALL ON public.fatturato_annuale_globale TO service_role;
