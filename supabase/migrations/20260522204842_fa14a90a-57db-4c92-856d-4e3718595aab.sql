
-- STEP 2: nuove colonne su contatti
ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS luogo_nascita text,
  ADD COLUMN IF NOT EXISTS data_nascita date,
  ADD COLUMN IF NOT EXISTS codice_fiscale text,
  ADD COLUMN IF NOT EXISTS residenza text,
  ADD COLUMN IF NOT EXISTS consenso_profilazione boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consenso_marketing_media boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consenso_marketing_diretto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;

-- STEP 7: nuovo valore enum tipo_richiesta
ALTER TYPE public.tipo_richiesta ADD VALUE IF NOT EXISTS 'nuovo_fido';

-- Aggiorna soglie livello fido (5000 / 20000)
INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('soglia_livello_1', '5000', 'Soglia livello 1 fido')
ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('soglia_livello_2', '20000', 'Soglia livello 2 fido')
ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

-- STEP 6: bucket firme pubblico + policy per autenticati
UPDATE storage.buckets SET public = true WHERE id = 'firme';

DROP POLICY IF EXISTS "firme select authenticated" ON storage.objects;
DROP POLICY IF EXISTS "firme insert authenticated" ON storage.objects;
DROP POLICY IF EXISTS "firme update authenticated" ON storage.objects;
DROP POLICY IF EXISTS "firme public read" ON storage.objects;

CREATE POLICY "firme public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'firme');

CREATE POLICY "firme insert authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'firme');

CREATE POLICY "firme update authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'firme');
