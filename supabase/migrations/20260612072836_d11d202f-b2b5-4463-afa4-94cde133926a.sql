ALTER TABLE public.azioni_recupero
  ADD COLUMN IF NOT EXISTS email_oggetto text,
  ADD COLUMN IF NOT EXISTS email_corpo_html text,
  ADD COLUMN IF NOT EXISTS email_destinatario text;