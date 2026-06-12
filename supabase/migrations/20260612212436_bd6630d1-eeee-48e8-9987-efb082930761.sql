
-- contatti: UPDATE solo per utenti autenticati
DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente"
ON public.contatti
FOR UPDATE
TO authenticated
USING (public.user_can_write_cliente(cliente_id))
WITH CHECK (public.user_can_write_cliente(cliente_id));

-- reminder: UPDATE solo per utenti autenticati
DROP POLICY IF EXISTS "Reminder: utente aggiorna i propri" ON public.reminder;
CREATE POLICY "Reminder: utente aggiorna i propri"
ON public.reminder
FOR UPDATE
TO authenticated
USING (
  (utente_id = auth.uid() OR public.has_role(auth.uid(), 'amministratore'::public.app_role))
)
WITH CHECK (
  (utente_id = auth.uid() OR public.has_role(auth.uid(), 'amministratore'::public.app_role))
  AND public.user_can_access_cliente(cliente_id)
);
