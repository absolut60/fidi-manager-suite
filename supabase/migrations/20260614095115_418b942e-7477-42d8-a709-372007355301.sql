
-- snapshot_scaduto: solo ruoli direzionali
DROP POLICY IF EXISTS "Tutti possono leggere snapshot_scaduto" ON public.snapshot_scaduto;
DROP POLICY IF EXISTS "Authenticated can read snapshot_scaduto" ON public.snapshot_scaduto;
DROP POLICY IF EXISTS "snapshot_scaduto select" ON public.snapshot_scaduto;
CREATE POLICY "snapshot_scaduto select ruoli direzionali"
  ON public.snapshot_scaduto FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  );

-- snapshot_scaduto_store: ruoli direzionali tutto, store_manager solo il proprio store
DROP POLICY IF EXISTS "Tutti possono leggere snapshot_scaduto_store" ON public.snapshot_scaduto_store;
DROP POLICY IF EXISTS "Authenticated can read snapshot_scaduto_store" ON public.snapshot_scaduto_store;
DROP POLICY IF EXISTS "snapshot_scaduto_store select" ON public.snapshot_scaduto_store;
CREATE POLICY "snapshot_scaduto_store select scoped"
  ON public.snapshot_scaduto_store FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profili p
      WHERE p.id = auth.uid() AND p.store_id IS NOT NULL AND p.store_id = snapshot_scaduto_store.store_id
    )
  );

-- snapshot_scaduto_cliente: filtra per cliente accessibile
DROP POLICY IF EXISTS "Tutti possono leggere snapshot_scaduto_cliente" ON public.snapshot_scaduto_cliente;
DROP POLICY IF EXISTS "Authenticated can read snapshot_scaduto_cliente" ON public.snapshot_scaduto_cliente;
DROP POLICY IF EXISTS "snapshot_scaduto_cliente select" ON public.snapshot_scaduto_cliente;
CREATE POLICY "snapshot_scaduto_cliente select scoped"
  ON public.snapshot_scaduto_cliente FOR SELECT TO authenticated
  USING (public.user_can_access_cliente(cliente_id));
