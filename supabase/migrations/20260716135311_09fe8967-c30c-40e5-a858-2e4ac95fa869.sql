DROP POLICY IF EXISTS richieste_interne_select ON public.richieste_interne;
CREATE POLICY richieste_interne_select ON public.richieste_interne
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_richieste_liv1')
  OR has_role(auth.uid(), 'approvatore_richieste_liv2')
  OR has_role(auth.uid(), 'gestore_richieste')
  OR has_role(auth.uid(), 'esecutore_richieste')
  OR (has_role(auth.uid(), 'richiedente') AND requester_id = auth.uid())
  OR (has_role(auth.uid(), 'richiedente') AND sede_id IS NOT NULL
      AND sede_id = (SELECT store_id FROM public.profili WHERE id = auth.uid()))
);