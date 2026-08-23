ALTER TABLE public.allegati
  DROP CONSTRAINT IF EXISTS allegati_entita_tipo_check;

ALTER TABLE public.allegati
  ADD CONSTRAINT allegati_entita_tipo_check
  CHECK (entita_tipo = ANY (ARRAY[
    'cliente'::text,
    'assicurazione'::text,
    'pratica_legale'::text,
    'azione_recupero'::text,
    'richiesta_fido'::text,
    'piano_rientro'::text,
    'campagna_email'::text,
    'articolo'::text,
    'kit'::text,
    'preventivo'::text,
    'task'::text
  ]));