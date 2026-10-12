ALTER TABLE public.importazioni
  ADD COLUMN IF NOT EXISTS problemi text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS esito_notificato_at timestamptz DEFAULT now();
ALTER TABLE public.importazioni ALTER COLUMN esito_notificato_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_importazioni_esito_da_notificare
  ON public.importazioni (completata_at)
  WHERE esito_notificato_at IS NULL AND completata_at IS NOT NULL;

COMMENT ON COLUMN public.importazioni.problemi IS 'Problemi veri dell''import, scritti nello stesso update che valorizza completata_at. Vuoto = nessun problema. Letto dal job importazioni-esito-notifica.';
COMMENT ON COLUMN public.importazioni.esito_notificato_at IS 'Quando il job importazioni-esito-notifica ha inviato l''avviso di esito. NULL = da notificare (righe precedenti alla colonna marcate come già notificate).';