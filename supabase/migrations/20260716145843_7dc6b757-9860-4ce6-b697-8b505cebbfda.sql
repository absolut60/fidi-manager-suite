DROP POLICY IF EXISTS richieste_interne_delete ON public.richieste_interne;
CREATE POLICY richieste_interne_delete ON public.richieste_interne
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR (requester_id = auth.uid() AND status = 'pending')
);