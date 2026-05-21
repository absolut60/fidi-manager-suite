ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS privacy_token uuid,
  ADD COLUMN IF NOT EXISTS privacy_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS clienti_privacy_token_unique
  ON public.clienti(privacy_token)
  WHERE privacy_token IS NOT NULL;