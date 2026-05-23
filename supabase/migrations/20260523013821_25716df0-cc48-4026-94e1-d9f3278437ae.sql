
TRUNCATE TABLE public.scadenze CASCADE;

DROP INDEX IF EXISTS public.scadenze_cliente_doc_sez_uniq;

CREATE UNIQUE INDEX scadenze_cliente_doc_sez_anno_uniq
  ON public.scadenze (cliente_id, numero_documento, sezionale, anno_partita)
  NULLS NOT DISTINCT;
