DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;

CREATE POLICY "Admin o store manager aggiornano clienti"
ON public.clienti
FOR UPDATE
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR store_id IN (SELECT profili.store_id FROM public.profili WHERE profili.id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR store_id IN (SELECT profili.store_id FROM public.profili WHERE profili.id = auth.uid())
);