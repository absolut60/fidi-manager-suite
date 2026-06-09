DROP INDEX IF EXISTS public.scadenze_cliente_doc_sez_anno_uniq;

CREATE UNIQUE INDEX scadenze_cliente_doc_sez_anno_datascad_uniq
  ON public.scadenze (
    cliente_id,
    numero_documento,
    sezionale,
    anno_partita,
    data_scadenza
  ) NULLS NOT DISTINCT;