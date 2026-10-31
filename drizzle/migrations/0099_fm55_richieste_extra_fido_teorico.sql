ALTER TABLE public.richieste_fido
  ADD COLUMN IF NOT EXISTS fido_teorico_riferimento numeric,
  ADD COLUMN IF NOT EXISTS motivo_extra_teorico text;

COMMENT ON COLUMN public.richieste_fido.fido_teorico_riferimento IS 'FM55: fido teorico mostrato al momento della richiesta (NULL = non disponibile o richiesta storica).';
COMMENT ON COLUMN public.richieste_fido.motivo_extra_teorico IS 'FM55: motivo quando importo_richiesto supera fido_teorico_riferimento.';

-- Gemello SQL di motivoExtraObbligatorio (src/lib/fidi.ts).
ALTER TABLE public.richieste_fido
  ADD CONSTRAINT richieste_fido_motivo_extra_teorico_check CHECK (
    fido_teorico_riferimento IS NULL
    OR importo_richiesto <= fido_teorico_riferimento
    OR nullif(trim(motivo_extra_teorico), '') IS NOT NULL
  );