
-- Assicurazioni
DROP POLICY IF EXISTS "Assicurazioni: admin/approvatori" ON public.assicurazioni_credito;

CREATE POLICY "Assicurazioni: visibilità per ruolo"
ON public.assicurazioni_credito FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
  OR has_role(auth.uid(), 'amministrazione')
  OR has_role(auth.uid(), 'direzione')
  OR cliente_id IN (
    SELECT c.id FROM public.clienti c
    JOIN public.profili p ON p.id = auth.uid()
    WHERE c.store_id = p.store_id
  )
);

CREATE POLICY "Assicurazioni: scrittura admin/approvatori"
ON public.assicurazioni_credito FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
);

-- Pratiche legali
DROP POLICY IF EXISTS "Pratiche legali: admin/approvatori" ON public.pratiche_legali;

CREATE POLICY "Pratiche legali: visibilità per ruolo"
ON public.pratiche_legali FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
  OR has_role(auth.uid(), 'amministrazione')
  OR has_role(auth.uid(), 'direzione')
  OR cliente_id IN (
    SELECT c.id FROM public.clienti c
    JOIN public.profili p ON p.id = auth.uid()
    WHERE c.store_id = p.store_id
  )
);

CREATE POLICY "Pratiche legali: scrittura admin/approvatori"
ON public.pratiche_legali FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
);

-- Storico pratiche legali
DROP POLICY IF EXISTS "Storico pratiche: admin/approvatori" ON public.storico_pratiche_legali;

CREATE POLICY "Storico pratiche: visibilità per ruolo"
ON public.storico_pratiche_legali FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore')
  OR has_role(auth.uid(), 'approvatore_liv1')
  OR has_role(auth.uid(), 'approvatore_liv2')
  OR has_role(auth.uid(), 'approvatore_liv3')
  OR pratica_id IN (
    SELECT pl.id FROM public.pratiche_legali pl
    JOIN public.clienti c ON c.id = pl.cliente_id
    JOIN public.profili p ON p.id = auth.uid()
    WHERE c.store_id = p.store_id
  )
);
