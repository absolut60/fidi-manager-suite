
-- 1. Helper functions for store-scoped access
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _cliente_id IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clienti c
      JOIN public.profili p ON p.id = auth.uid()
      WHERE c.id = _cliente_id AND c.store_id IS NOT NULL AND c.store_id = p.store_id
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_can_access_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_cliente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_write_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _cliente_id IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clienti c
      JOIN public.profili p ON p.id = auth.uid()
      WHERE c.id = _cliente_id AND c.store_id IS NOT NULL AND c.store_id = p.store_id
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_can_write_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_write_cliente(uuid) TO authenticated;

-- Storage path → cliente_id resolver (paths: "clienti/<uuid>/..." or "contatti/<uuid>/...")
CREATE OR REPLACE FUNCTION public.storage_path_cliente_id(_name text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[];
  entity text;
  eid uuid;
BEGIN
  IF _name IS NULL THEN RETURN NULL; END IF;
  parts := string_to_array(_name, '/');
  IF array_length(parts, 1) < 2 THEN RETURN NULL; END IF;
  entity := parts[1];
  BEGIN
    eid := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF entity = 'clienti' THEN
    RETURN eid;
  ELSIF entity = 'contatti' THEN
    RETURN (SELECT cliente_id FROM public.contatti WHERE id = eid);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.storage_path_cliente_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_path_cliente_id(text) TO authenticated;

-- 2. RLS: cantieri INSERT — restrict to user's store
DROP POLICY IF EXISTS "Cantieri: insert come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: insert come il cliente"
ON public.cantieri FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_cliente(cliente_id));

-- 3. RLS: clienti INSERT — store deve essere quello dell'utente (o admin)
DROP POLICY IF EXISTS "Autenticati creano clienti" ON public.clienti;
CREATE POLICY "Autenticati creano clienti"
ON public.clienti FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    store_id IS NOT NULL
    AND store_id = (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

-- 4. RLS: contatti INSERT — solo per clienti del proprio store
DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente"
ON public.contatti FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_cliente(cliente_id));

-- 5. RLS: notifiche INSERT — solo per se stessi (i trigger SECURITY DEFINER bypassano RLS)
DROP POLICY IF EXISTS "Notifiche: autenticati inseriscono" ON public.notifiche;
CREATE POLICY "Notifiche: solo per se stessi o admin"
ON public.notifiche FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'amministratore'::app_role)
);

-- 6. Storage: bucket "firme" — SELECT scoped per store
DROP POLICY IF EXISTS "Firme: admin elenca" ON storage.objects;
CREATE POLICY "Firme: select scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'firme'
  AND public.user_can_access_cliente(public.storage_path_cliente_id(name))
);

-- Tighten firme INSERT/UPDATE to store-scoped writes (remove duplicates)
DROP POLICY IF EXISTS "Firme: autenticati caricano" ON storage.objects;
DROP POLICY IF EXISTS "Firme: insert autenticati" ON storage.objects;
DROP POLICY IF EXISTS "firme insert authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Firme: autenticati aggiornano" ON storage.objects;
DROP POLICY IF EXISTS "firme update authenticated" ON storage.objects;
CREATE POLICY "Firme: insert scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'firme'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);
CREATE POLICY "Firme: update scoped"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'firme'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);

-- 7. Storage: bucket "documenti-privacy" — scoped per store
DROP POLICY IF EXISTS "DocumentiPrivacy: autenticati leggono" ON storage.objects;
DROP POLICY IF EXISTS "DocumentiPrivacy: autenticati caricano" ON storage.objects;
DROP POLICY IF EXISTS "DocumentiPrivacy: autenticati aggiornano" ON storage.objects;
CREATE POLICY "DocumentiPrivacy: select scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documenti-privacy'
  AND public.user_can_access_cliente(public.storage_path_cliente_id(name))
);
CREATE POLICY "DocumentiPrivacy: insert scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documenti-privacy'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);
CREATE POLICY "DocumentiPrivacy: update scoped"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documenti-privacy'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);

-- 8. Storage: bucket "privacy-pdf" — solo admin (non risulta uso applicativo)
DROP POLICY IF EXISTS "PrivacyPdf: autenticati leggono" ON storage.objects;
DROP POLICY IF EXISTS "PrivacyPdf: autenticati caricano" ON storage.objects;
CREATE POLICY "PrivacyPdf: select admin"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'privacy-pdf' AND public.has_role(auth.uid(), 'amministratore'::app_role));
CREATE POLICY "PrivacyPdf: insert admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'privacy-pdf' AND public.has_role(auth.uid(), 'amministratore'::app_role));

-- 9. Storage: bucket "schede-clienti" — scoped per store (path "clienti/<uuid>/...")
DROP POLICY IF EXISTS "Schede: select autenticati" ON storage.objects;
DROP POLICY IF EXISTS "Schede: insert autenticati" ON storage.objects;
DROP POLICY IF EXISTS "Schede: update autenticati" ON storage.objects;
CREATE POLICY "Schede: select scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'schede-clienti'
  AND public.user_can_access_cliente(public.storage_path_cliente_id(name))
);
CREATE POLICY "Schede: insert scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'schede-clienti'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);
CREATE POLICY "Schede: update scoped"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'schede-clienti'
  AND public.user_can_write_cliente(public.storage_path_cliente_id(name))
);
