ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS consensi_token uuid,
  ADD COLUMN IF NOT EXISTS consensi_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS firma_nome_dichiarato text;

CREATE INDEX IF NOT EXISTS contatti_consensi_token_idx ON public.contatti(consensi_token);