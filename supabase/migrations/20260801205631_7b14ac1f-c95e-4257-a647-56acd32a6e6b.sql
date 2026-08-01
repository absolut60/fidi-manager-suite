ALTER TABLE public.promemoria_scadenza_log ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.campagne_sollecito_destinatari ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.campagne_email_destinatari ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.azioni_recupero ADD COLUMN IF NOT EXISTS email_message_id text;