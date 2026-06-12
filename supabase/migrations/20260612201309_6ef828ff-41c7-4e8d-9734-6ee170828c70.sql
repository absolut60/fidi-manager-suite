ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS indirizzo text,
  ADD COLUMN IF NOT EXISTS cap text,
  ADD COLUMN IF NOT EXISTS citta text,
  ADD COLUMN IF NOT EXISTS provincia text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email_sede text,
  ADD COLUMN IF NOT EXISTS pec_sede text,
  ADD COLUMN IF NOT EXISTS piva text,
  ADD COLUMN IF NOT EXISTS ragione_sociale_sede text;