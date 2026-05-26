ALTER TABLE public.clienti ADD COLUMN IF NOT EXISTS cellulare text;
ALTER TABLE public.clienti DROP CONSTRAINT IF EXISTS clienti_tipo_soggetto_check;
ALTER TABLE public.clienti ADD CONSTRAINT clienti_tipo_soggetto_check CHECK (tipo_soggetto IS NULL OR lower(tipo_soggetto) IN ('persona_fisica','azienda'));