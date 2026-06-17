-- Aggiunge tracciamento approvatore su richieste_fido
ALTER TABLE public.richieste_fido
  ADD COLUMN IF NOT EXISTS approvato_da uuid,
  ADD COLUMN IF NOT EXISTS data_approvazione timestamptz;

-- FK a profili (allineata a richieste_fido_created_by_fkey)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'richieste_fido_approvato_da_fkey'
  ) THEN
    ALTER TABLE public.richieste_fido
      ADD CONSTRAINT richieste_fido_approvato_da_fkey
      FOREIGN KEY (approvato_da) REFERENCES public.profili(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_richieste_fido_approvato_da
  ON public.richieste_fido(approvato_da);