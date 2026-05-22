
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS fido numeric,
  ADD COLUMN IF NOT EXISTS totale_rischio numeric,
  ADD COLUMN IF NOT EXISTS fido_residuo numeric,
  ADD COLUMN IF NOT EXISTS scaduto numeric,
  ADD COLUMN IF NOT EXISTS a_scadere numeric,
  ADD COLUMN IF NOT EXISTS dilazione_concordata integer,
  ADD COLUMN IF NOT EXISTS dilazione_effettiva integer;

CREATE UNIQUE INDEX IF NOT EXISTS clienti_codice_gestionale_unique
  ON public.clienti (codice_gestionale)
  WHERE codice_gestionale IS NOT NULL;
