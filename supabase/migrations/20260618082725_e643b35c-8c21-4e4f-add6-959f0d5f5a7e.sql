
DROP POLICY IF EXISTS "Comunicazioni: update autore o admin" ON public.comunicazioni_richiesta;
DROP POLICY IF EXISTS "Comunicazioni: delete autore o admin" ON public.comunicazioni_richiesta;

CREATE POLICY "Comunicazioni: update solo autore"
ON public.comunicazioni_richiesta
FOR UPDATE
TO authenticated
USING (autore_id = auth.uid())
WITH CHECK (autore_id = auth.uid());

CREATE POLICY "Comunicazioni: delete autore o moderatori"
ON public.comunicazioni_richiesta
FOR DELETE
TO authenticated
USING (
  autore_id = auth.uid()
  OR has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
);
