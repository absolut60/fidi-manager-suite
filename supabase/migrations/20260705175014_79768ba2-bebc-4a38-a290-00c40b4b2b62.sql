
-- 1) Add piano_rientro_id to azioni_recupero, cascade delete when piano is removed
ALTER TABLE public.azioni_recupero
  ADD COLUMN IF NOT EXISTS piano_rientro_id UUID
  REFERENCES public.piani_rientro(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_azioni_piano_rientro
  ON public.azioni_recupero(piano_rientro_id)
  WHERE piano_rientro_id IS NOT NULL;

-- 2) Expand esito CHECK to include 'piano_rientro'
ALTER TABLE public.azioni_recupero DROP CONSTRAINT IF EXISTS azioni_recupero_esito_check;
ALTER TABLE public.azioni_recupero ADD CONSTRAINT azioni_recupero_esito_check
  CHECK (esito = ANY (ARRAY[
    'da_fare'::text, 'fatto'::text, 'nessuna_risposta'::text,
    'promessa_pagamento'::text, 'contestazione'::text, 'pagato'::text,
    'piano_rientro'::text
  ]));

-- 3) Backfill: link existing 'piano_rientro' actions to their piano (by cliente + timestamp proximity).
--    Safe no-op if no rows match. Uses the closest piano created in the same cliente within +/-2 min.
UPDATE public.azioni_recupero a
SET piano_rientro_id = p.id
FROM public.piani_rientro p
WHERE a.piano_rientro_id IS NULL
  AND a.esito = 'piano_rientro'
  AND a.cliente_id = p.cliente_id
  AND ABS(EXTRACT(EPOCH FROM (a.created_at - p.created_at))) < 120;
