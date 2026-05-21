
INSERT INTO storage.buckets (id, name, public) VALUES ('firme', 'firme', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('privacy-pdf', 'privacy-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Firme: autenticati possono leggere/caricare/aggiornare
CREATE POLICY "Firme: autenticati leggono"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'firme');

CREATE POLICY "Firme: autenticati caricano"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'firme');

CREATE POLICY "Firme: autenticati aggiornano"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'firme');

CREATE POLICY "Firme: admin elimina"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'firme' AND public.has_role(auth.uid(), 'amministratore'::app_role));

-- Privacy PDF
CREATE POLICY "PrivacyPdf: autenticati leggono"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'privacy-pdf');

CREATE POLICY "PrivacyPdf: autenticati caricano"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'privacy-pdf');

CREATE POLICY "PrivacyPdf: admin elimina"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'privacy-pdf' AND public.has_role(auth.uid(), 'amministratore'::app_role));

-- Aggiungi colonna privacy_pdf_url su clienti
ALTER TABLE public.clienti ADD COLUMN IF NOT EXISTS privacy_pdf_url text;
