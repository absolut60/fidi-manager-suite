ALTER TABLE public.attivita_commerciale
  ADD COLUMN indirizzo text,
  ADD COLUMN cap text,
  ADD COLUMN citta text,
  ADD COLUMN provincia text,
  ADD COLUMN sede_riferimento_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
CREATE INDEX idx_attivita_commerciale_sede_riferimento_id ON public.attivita_commerciale(sede_riferimento_id);