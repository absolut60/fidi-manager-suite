
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS tipo_soggetto text CHECK (tipo_soggetto IN ('persona_fisica','azienda')),
  ADD COLUMN IF NOT EXISTS codice_gestionale text,
  ADD COLUMN IF NOT EXISTS pec text,
  ADD COLUMN IF NOT EXISTS codice_sdi text,
  ADD COLUMN IF NOT EXISTS banca text,
  ADD COLUMN IF NOT EXISTS agenzia text,
  ADD COLUMN IF NOT EXISTS abi text,
  ADD COLUMN IF NOT EXISTS cab text,
  ADD COLUMN IF NOT EXISTS dichiarante_nome text,
  ADD COLUMN IF NOT EXISTS dichiarante_cognome text,
  ADD COLUMN IF NOT EXISTS condizioni_pagamento text,
  ADD COLUMN IF NOT EXISTS scheda_pdf_url text;

CREATE UNIQUE INDEX IF NOT EXISTS clienti_codice_gestionale_unique
  ON public.clienti (codice_gestionale)
  WHERE codice_gestionale IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('schede-clienti', 'schede-clienti', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Schede: select autenticati"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'schede-clienti');

CREATE POLICY "Schede: insert autenticati"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'schede-clienti');

CREATE POLICY "Schede: update autenticati"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'schede-clienti');

CREATE POLICY "Schede: delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'schede-clienti' AND public.has_role(auth.uid(), 'amministratore'));
