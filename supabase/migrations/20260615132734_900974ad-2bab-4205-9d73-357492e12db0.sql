
-- UPDATE: solo admin/amministrazione/direzione oppure il creatore dell'azione (con accesso al cliente)
DROP POLICY IF EXISTS "Store manager aggiorna azioni dei suoi clienti" ON public.azioni_recupero;
CREATE POLICY "Aggiorna azioni proprie o admin" ON public.azioni_recupero
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (operatore_id = auth.uid() AND user_can_access_cliente(cliente_id))
  )
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (operatore_id = auth.uid() AND user_can_access_cliente(cliente_id))
  );

-- DELETE: stessa regola
DROP POLICY IF EXISTS "Store manager elimina azioni dei suoi clienti" ON public.azioni_recupero;
CREATE POLICY "Elimina azioni proprie o admin" ON public.azioni_recupero
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (operatore_id = auth.uid() AND user_can_access_cliente(cliente_id))
  );
