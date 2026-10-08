DROP POLICY "Lettura fido teorico per autenticati" ON public.fido_teorico_cliente;

CREATE POLICY "Lettura fido teorico: solo clienti visibili"
  ON public.fido_teorico_cliente
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clienti c
      WHERE c.id = fido_teorico_cliente.cliente_id
    )
  );

COMMENT ON POLICY "Lettura fido teorico: solo clienti visibili" ON public.fido_teorico_cliente IS
  'Il fido teorico è leggibile solo per i clienti che l''utente può vedere: la sotto-query passa dalla RLS di public.clienti (fonte unica della visibilità).';