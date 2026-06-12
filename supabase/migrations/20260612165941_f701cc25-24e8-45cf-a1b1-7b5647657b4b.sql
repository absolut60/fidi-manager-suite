
DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;

CREATE POLICY "Admin o store manager aggiornano clienti"
ON public.clienti
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (store_id IN (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    store_id IN (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid())
    AND store_id = (SELECT c.store_id FROM public.clienti c WHERE c.id = clienti.id)
  )
);
