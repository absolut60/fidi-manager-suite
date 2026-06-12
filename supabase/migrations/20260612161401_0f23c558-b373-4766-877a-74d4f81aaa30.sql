
DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
  FOR UPDATE TO authenticated
  USING (user_can_write_cliente(cliente_id))
  WITH CHECK (user_can_write_cliente(cliente_id));

DROP POLICY IF EXISTS "Utenti aggiornano il proprio profilo" ON public.profili;
CREATE POLICY "Utenti aggiornano il proprio profilo" ON public.profili
  FOR UPDATE TO authenticated
  USING ((auth.uid() = id) OR has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR ((auth.uid() = id) AND (NOT (store_id IS DISTINCT FROM (SELECT p.store_id FROM profili p WHERE p.id = auth.uid()))))
  );

DROP POLICY IF EXISTS "Solleciti: insert scoped" ON public.solleciti;
CREATE POLICY "Solleciti: insert scoped" ON public.solleciti
  FOR INSERT TO authenticated
  WITH CHECK (user_can_write_cliente(cliente_id));
