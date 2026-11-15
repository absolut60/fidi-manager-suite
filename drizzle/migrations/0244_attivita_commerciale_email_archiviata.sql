ALTER TABLE public.attivita_commerciale
  ADD COLUMN IF NOT EXISTS email_destinatario text,
  ADD COLUMN IF NOT EXISTS email_cc text,
  ADD COLUMN IF NOT EXISTS email_bcc text,
  ADD COLUMN IF NOT EXISTS email_oggetto text,
  ADD COLUMN IF NOT EXISTS email_corpo_html text;