
-- Tabella note legali dal gestionale (importata da Excel)
CREATE TABLE IF NOT EXISTS public.note_legali_gestionali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  testo text NOT NULL,
  categoria text,
  importato_da uuid REFERENCES public.importazioni(id) ON DELETE SET NULL,
  ultima_sincronizzazione timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS note_legali_gestionali_cliente_uidx
  ON public.note_legali_gestionali(cliente_id);

ALTER TABLE public.note_legali_gestionali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Note legali gest: select come il cliente"
  ON public.note_legali_gestionali FOR SELECT TO authenticated
  USING (
    cliente_id IN (
      SELECT c.id FROM public.clienti c
      WHERE has_role(auth.uid(),'amministratore'::app_role)
        OR has_role(auth.uid(),'approvatore_liv1'::app_role)
        OR has_role(auth.uid(),'approvatore_liv2'::app_role)
        OR has_role(auth.uid(),'approvatore_liv3'::app_role)
        OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "Note legali gest: insert admin/approvatori"
  ON public.note_legali_gestionali FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'approvatore_liv1'::app_role)
    OR has_role(auth.uid(),'approvatore_liv2'::app_role)
    OR has_role(auth.uid(),'approvatore_liv3'::app_role)
  );

CREATE POLICY "Note legali gest: update admin/approvatori"
  ON public.note_legali_gestionali FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'approvatore_liv1'::app_role)
    OR has_role(auth.uid(),'approvatore_liv2'::app_role)
    OR has_role(auth.uid(),'approvatore_liv3'::app_role)
  );

CREATE POLICY "Note legali gest: delete admin"
  ON public.note_legali_gestionali FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role));

-- in_gestione_legale già esiste su clienti (boolean default false); no-op se presente
ALTER TABLE public.clienti
  ALTER COLUMN in_gestione_legale SET DEFAULT false;

-- Bucket per allegati pratiche legali
INSERT INTO storage.buckets (id, name, public)
VALUES ('pratiche-legali', 'pratiche-legali', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Pratiche legali storage: read admin/approvatori"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pratiche-legali' AND (
      has_role(auth.uid(),'amministratore'::app_role)
      OR has_role(auth.uid(),'approvatore_liv1'::app_role)
      OR has_role(auth.uid(),'approvatore_liv2'::app_role)
      OR has_role(auth.uid(),'approvatore_liv3'::app_role)
    )
  );

CREATE POLICY "Pratiche legali storage: insert admin/approvatori"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pratiche-legali' AND (
      has_role(auth.uid(),'amministratore'::app_role)
      OR has_role(auth.uid(),'approvatore_liv1'::app_role)
      OR has_role(auth.uid(),'approvatore_liv2'::app_role)
      OR has_role(auth.uid(),'approvatore_liv3'::app_role)
    )
  );

CREATE POLICY "Pratiche legali storage: delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pratiche-legali' AND has_role(auth.uid(),'amministratore'::app_role)
  );

-- Tabella allegati pratiche legali
CREATE TABLE IF NOT EXISTS public.pratiche_legali_allegati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id uuid NOT NULL REFERENCES public.pratiche_legali(id) ON DELETE CASCADE,
  nome_file text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caricato_da uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pratiche_legali_allegati ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allegati pratiche: admin/approvatori"
  ON public.pratiche_legali_allegati FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'approvatore_liv1'::app_role)
    OR has_role(auth.uid(),'approvatore_liv2'::app_role)
    OR has_role(auth.uid(),'approvatore_liv3'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'approvatore_liv1'::app_role)
    OR has_role(auth.uid(),'approvatore_liv2'::app_role)
    OR has_role(auth.uid(),'approvatore_liv3'::app_role)
  );
