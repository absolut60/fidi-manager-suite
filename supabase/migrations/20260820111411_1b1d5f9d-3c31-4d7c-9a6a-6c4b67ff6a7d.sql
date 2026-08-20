ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocodifica_stato text DEFAULT 'da_geocodificare',
  ADD COLUMN IF NOT EXISTS geocodificato_il timestamptz;

ALTER TABLE public.cantieri
  ADD COLUMN IF NOT EXISTS sede_piu_vicina_id uuid REFERENCES public.stores(id),
  ADD COLUMN IF NOT EXISTS sede_piu_vicina_km numeric,
  ADD COLUMN IF NOT EXISTS sede_piu_vicina_min integer,
  ADD COLUMN IF NOT EXISTS sede_piu_vicina_calcolata_il timestamptz;

CREATE INDEX IF NOT EXISTS idx_cantieri_sede_piu_vicina ON public.cantieri(sede_piu_vicina_id);