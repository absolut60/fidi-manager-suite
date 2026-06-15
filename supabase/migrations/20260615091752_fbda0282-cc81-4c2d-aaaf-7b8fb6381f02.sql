-- 1) storico_pratiche_legali: write policies
CREATE POLICY "Storico pratiche: insert admin/approvatori"
ON public.storico_pratiche_legali
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

CREATE POLICY "Storico pratiche: update admin"
ON public.storico_pratiche_legali
FOR UPDATE
USING (has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Storico pratiche: delete admin"
ON public.storico_pratiche_legali
FOR DELETE
USING (has_role(auth.uid(), 'amministratore'::app_role));

-- 2) comunicazioni_richiesta: update/delete policies
CREATE POLICY "Comunicazioni: update autore o admin"
ON public.comunicazioni_richiesta
FOR UPDATE
USING (
  autore_id = auth.uid()
  OR has_role(auth.uid(), 'amministratore'::app_role)
)
WITH CHECK (
  autore_id = auth.uid()
  OR has_role(auth.uid(), 'amministratore'::app_role)
);

CREATE POLICY "Comunicazioni: delete autore o admin"
ON public.comunicazioni_richiesta
FOR DELETE
USING (
  autore_id = auth.uid()
  OR has_role(auth.uid(), 'amministratore'::app_role)
);

-- 3) pratiche_legali_allegati: select per store manager via cliente associato
CREATE POLICY "Allegati pratiche: select store manager via cliente"
ON public.pratiche_legali_allegati
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.pratiche_legali pl
    WHERE pl.id = pratiche_legali_allegati.pratica_id
      AND public.user_can_access_cliente(pl.cliente_id)
  )
);