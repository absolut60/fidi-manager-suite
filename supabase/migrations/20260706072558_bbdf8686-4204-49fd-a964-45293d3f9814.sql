
-- 1) campagne_sollecito: aggiungi role scoping (store_manager) alle policy per operatore
DROP POLICY IF EXISTS "Store manager crea sue campagne" ON public.campagne_sollecito;
DROP POLICY IF EXISTS "Store manager aggiorna sue campagne" ON public.campagne_sollecito;
DROP POLICY IF EXISTS "Store manager elimina sue campagne" ON public.campagne_sollecito;
DROP POLICY IF EXISTS "Store manager vede sue campagne" ON public.campagne_sollecito;

CREATE POLICY "Store manager vede sue campagne"
ON public.campagne_sollecito
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'store_manager'::app_role)
  AND operatore_id = auth.uid()
);

CREATE POLICY "Store manager crea sue campagne"
ON public.campagne_sollecito
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'store_manager'::app_role)
  AND operatore_id = auth.uid()
);

CREATE POLICY "Store manager aggiorna sue campagne"
ON public.campagne_sollecito
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'store_manager'::app_role)
  AND operatore_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'store_manager'::app_role)
  AND operatore_id = auth.uid()
);

CREATE POLICY "Store manager elimina sue campagne"
ON public.campagne_sollecito
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'store_manager'::app_role)
  AND operatore_id = auth.uid()
);

-- 2) clienti: rimuovi la clausola created_by che bypassa lo store scoping
DROP POLICY IF EXISTS "Visibilità clienti per ruolo" ON public.clienti;

CREATE POLICY "Visibilità clienti per ruolo"
ON public.clienti
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    store_id IN (
      SELECT profili.store_id
      FROM profili
      WHERE profili.id = auth.uid()
    )
  )
);
