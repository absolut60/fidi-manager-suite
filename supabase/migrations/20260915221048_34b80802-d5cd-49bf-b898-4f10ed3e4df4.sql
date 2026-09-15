ALTER TABLE public.eventi_partecipanti
  ADD COLUMN IF NOT EXISTS riconciliato_il timestamptz,
  ADD COLUMN IF NOT EXISTS registrato_sul_posto boolean NOT NULL DEFAULT false;