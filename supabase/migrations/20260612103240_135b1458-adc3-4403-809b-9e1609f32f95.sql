
DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
  FOR UPDATE USING (public.user_can_write_cliente(cliente_id))
  WITH CHECK (public.user_can_write_cliente(cliente_id));

DROP POLICY IF EXISTS "Solleciti: insert scoped" ON public.solleciti;
CREATE POLICY "Solleciti: insert scoped" ON public.solleciti
  FOR INSERT WITH CHECK (public.user_can_write_cliente(cliente_id));
