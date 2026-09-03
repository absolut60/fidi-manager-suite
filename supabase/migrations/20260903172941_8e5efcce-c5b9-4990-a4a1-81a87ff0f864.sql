ALTER TABLE public.campagne_email_marketing
  ADD COLUMN IF NOT EXISTS mittente_nome text,
  ADD COLUMN IF NOT EXISTS mittente_email text;