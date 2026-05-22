-- Bucket privato per i file di import
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-files', 'import-files', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: admin + approvatori possono leggere/scrivere/eliminare
CREATE POLICY "Import files: select admin/approvatori"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'import-files' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
);

CREATE POLICY "Import files: insert admin/approvatori"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'import-files' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
  )
);

CREATE POLICY "Import files: delete admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'import-files' AND public.has_role(auth.uid(), 'amministratore'::public.app_role));

-- Colonna file_path su importazioni
ALTER TABLE public.importazioni
  ADD COLUMN IF NOT EXISTS file_path text;