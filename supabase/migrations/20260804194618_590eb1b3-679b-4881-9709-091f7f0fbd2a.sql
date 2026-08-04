DROP POLICY "Admin o store manager aggiornano clienti" ON public.clienti;
CREATE POLICY "Admin o store manager aggiornano clienti"
ON public.clienti
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

DROP POLICY "Storico pratiche: visibilità per ruolo" ON public.storico_pratiche_legali;
CREATE POLICY "Storico pratiche: visibilità per ruolo"
ON public.storico_pratiche_legali
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR pratica_id IN (
    SELECT pl.id
    FROM pratiche_legali pl
    JOIN clienti c ON c.id = pl.cliente_id
    JOIN profili p ON p.id = auth.uid()
    WHERE p.store_id IS NOT NULL AND c.store_id IS NOT NULL AND c.store_id = p.store_id
  )
);