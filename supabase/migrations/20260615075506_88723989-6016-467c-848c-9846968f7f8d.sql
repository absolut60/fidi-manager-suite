DROP POLICY IF EXISTS "Snapshot leggibile da utenti autenticati" ON public.snapshot_scaduto;
DROP POLICY IF EXISTS "Snap store leggibile" ON public.snapshot_scaduto_store;
DROP POLICY IF EXISTS "Snap cliente leggibile" ON public.snapshot_scaduto_cliente;