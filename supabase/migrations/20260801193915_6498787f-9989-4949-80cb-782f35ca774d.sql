ALTER TABLE public.campagne_email_marketing DROP CONSTRAINT IF EXISTS campagne_email_marketing_stato_chk;
ALTER TABLE public.campagne_email_marketing
  ADD CONSTRAINT campagne_email_marketing_stato_chk
  CHECK (stato = ANY (ARRAY['bozza','pronta','in_corso','completata','completata_con_errori','annullata']));

ALTER TABLE public.campagne_email_marketing
  ADD COLUMN IF NOT EXISTS inviata_at timestamptz,
  ADD COLUMN IF NOT EXISTS inviati int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS falliti int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saltati int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS operatore_id uuid;

ALTER TABLE public.campagne_email_destinatari
  ADD COLUMN IF NOT EXISTS inviato_at timestamptz,
  ADD COLUMN IF NOT EXISTS errore text;

ALTER TABLE public.campagne_email_destinatari DROP CONSTRAINT IF EXISTS campagne_email_destinatari_stato_invio_check;
ALTER TABLE public.campagne_email_destinatari
  ADD CONSTRAINT campagne_email_destinatari_stato_invio_check
  CHECK (stato_invio = ANY (ARRAY['da_inviare','inviato','fallito','email_non_valida','saltato']));

ALTER TABLE public.contatti ADD COLUMN IF NOT EXISTS recesso_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS contatti_recesso_token_uniq ON public.contatti(recesso_token) WHERE recesso_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS campagne_email_destinatari_stato_idx
  ON public.campagne_email_destinatari(campagna_id, stato_invio);

INSERT INTO public.configurazioni (chiave, valore)
VALUES ('campagna_marketing_blocco', '12'), ('campagna_marketing_pausa_sec', '60')
ON CONFLICT (chiave) DO NOTHING;