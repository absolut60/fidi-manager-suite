
-- Clienti: SELECT policy scoped to authenticated
DROP POLICY IF EXISTS "Visibilità clienti per ruolo" ON public.clienti;
CREATE POLICY "Visibilità clienti per ruolo"
ON public.clienti
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (store_id IN (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid()))
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente IN (
      SELECT p.codice_agente FROM profili p
      WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL
    )
  )
);

-- Contatti: scope all three public-role policies to authenticated
DROP POLICY IF EXISTS "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente"
ON public.contatti
FOR SELECT
TO authenticated
USING (user_can_access_cliente(cliente_id));

DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente"
ON public.contatti
FOR INSERT
TO authenticated
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
);

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente"
ON public.contatti
FOR UPDATE
TO authenticated
USING (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
)
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
);

-- Storage PrivacyPdf: require non-null cliente_id in path (remove the "IS NULL" bypass)
DROP POLICY IF EXISTS "PrivacyPdf: insert admin scoped" ON storage.objects;
CREATE POLICY "PrivacyPdf: insert admin scoped"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
  AND storage_path_cliente_id(name) IS NOT NULL
  AND user_can_write_cliente(storage_path_cliente_id(name))
);

DROP POLICY IF EXISTS "PrivacyPdf: update admin scoped" ON storage.objects;
CREATE POLICY "PrivacyPdf: update admin scoped"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
)
WITH CHECK (
  bucket_id = 'privacy-pdf'
  AND has_role(auth.uid(), 'amministratore'::app_role)
  AND storage_path_cliente_id(name) IS NOT NULL
  AND user_can_write_cliente(storage_path_cliente_id(name))
);
