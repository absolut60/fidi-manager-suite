-- Aggiunge WITH CHECK alle policy UPDATE per impedire riassegnazioni cross-store/cross-user

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente"
ON public.contatti
FOR UPDATE
USING (public.user_can_write_cliente(cliente_id))
WITH CHECK (public.user_can_write_cliente(cliente_id));

DROP POLICY IF EXISTS "Reminder: utente aggiorna i propri" ON public.reminder;
CREATE POLICY "Reminder: utente aggiorna i propri"
ON public.reminder
FOR UPDATE
USING ((utente_id = auth.uid()) OR public.has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    utente_id = auth.uid()
    AND (cliente_id IS NULL OR public.user_can_access_cliente(cliente_id))
  )
);