
-- 1) Tabella polimorfica allegati
CREATE TABLE public.allegati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entita_tipo text NOT NULL CHECK (entita_tipo IN ('cliente','assicurazione','pratica_legale','azione_recupero')),
  entita_id uuid NOT NULL,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE CASCADE,
  nome_file text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  dimensione_bytes bigint,
  descrizione text,
  caricato_da uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_allegati_entita ON public.allegati (entita_tipo, entita_id);
CREATE INDEX idx_allegati_cliente ON public.allegati (cliente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allegati TO authenticated;
GRANT ALL ON public.allegati TO service_role;

ALTER TABLE public.allegati ENABLE ROW LEVEL SECURITY;

-- SELECT: chi può accedere al cliente collegato
CREATE POLICY "allegati_select"
ON public.allegati FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR (cliente_id IS NOT NULL AND public.user_can_access_cliente(cliente_id))
);

-- INSERT: deve sempre passare cliente_id valido e avere accesso;
-- per pratica_legale / assicurazione richiediamo ruoli admin/approvatori
CREATE POLICY "allegati_insert"
ON public.allegati FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id IS NOT NULL
  AND caricato_da = auth.uid()
  AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR (
      entita_tipo IN ('pratica_legale','assicurazione')
      AND (
        public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
    OR (
      entita_tipo IN ('cliente','azione_recupero')
      AND public.user_can_write_cliente(cliente_id)
    )
  )
);

-- DELETE: caricatore stesso oppure amministratore
CREATE POLICY "allegati_delete"
ON public.allegati FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR caricato_da = auth.uid()
);

-- 2) Policy storage.objects sul bucket 'allegati'
-- L'accesso ai file segue l'accesso alla riga in public.allegati
CREATE POLICY "allegati_storage_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'allegati'
  AND EXISTS (
    SELECT 1 FROM public.allegati a
    WHERE a.storage_path = storage.objects.name
      AND (
        public.has_role(auth.uid(), 'amministratore'::app_role)
        OR (a.cliente_id IS NOT NULL AND public.user_can_access_cliente(a.cliente_id))
      )
  )
);

CREATE POLICY "allegati_storage_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'allegati'
  AND owner = auth.uid()
);

CREATE POLICY "allegati_storage_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'allegati'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'amministratore'::app_role)
  )
);
