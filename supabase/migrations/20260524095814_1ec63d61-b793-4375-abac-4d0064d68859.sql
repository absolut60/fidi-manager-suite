
-- 1. audit_log: remove direct insert; triggers (SECURITY DEFINER) keep working
DROP POLICY IF EXISTS "Audit: autenticati scrivono" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;

-- 2. storico_fido: restrict insert to admin/approvatori, enforce eseguito_da = auth.uid()
DROP POLICY IF EXISTS "Storico fido: insert autenticati" ON public.storico_fido;
CREATE POLICY "Storico fido: insert approvatori"
  ON public.storico_fido
  FOR INSERT
  TO authenticated
  WITH CHECK (
    eseguito_da = auth.uid()
    AND (
      public.has_role(auth.uid(), 'amministratore'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    )
  );

-- 3. reminder: enforce utente_id = auth.uid() (admin can target anyone)
DROP POLICY IF EXISTS "Reminder: admin/approvatori inseriscono" ON public.reminder;
CREATE POLICY "Reminder: insert con utente_id corretto"
  ON public.reminder
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR (
      utente_id = auth.uid()
      AND (
        public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
  );

-- 4. Storage UPDATE policies: add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "Schede: update scoped" ON storage.objects;
CREATE POLICY "Schede: update scoped"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'schede-clienti' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)))
  WITH CHECK (bucket_id = 'schede-clienti' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)));

DROP POLICY IF EXISTS "DocumentiPrivacy: update scoped" ON storage.objects;
CREATE POLICY "DocumentiPrivacy: update scoped"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documenti-privacy' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)))
  WITH CHECK (bucket_id = 'documenti-privacy' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)));

DROP POLICY IF EXISTS "Firme: update scoped" ON storage.objects;
CREATE POLICY "Firme: update scoped"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'firme' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)))
  WITH CHECK (bucket_id = 'firme' AND public.user_can_write_cliente(public.storage_path_cliente_id(name)));
