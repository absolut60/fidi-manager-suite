-- 1) clienti: rimuove la clausola auto-referenziale inefficace per il ruolo marketing
DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;

CREATE POLICY "Admin o store manager aggiornano clienti"
ON public.clienti
FOR UPDATE
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL AND codice_agente IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL AND codice_agente IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

-- trigger che impedisce ai non-amministratori di riassegnare un cliente ad altra sede
CREATE OR REPLACE FUNCTION public.impedisci_cambio_store_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Solo un amministratore puo cambiare la sede di un cliente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedisci_cambio_store_cliente ON public.clienti;
CREATE TRIGGER trg_impedisci_cambio_store_cliente
BEFORE UPDATE OF store_id ON public.clienti
FOR EACH ROW EXECUTE FUNCTION public.impedisci_cambio_store_cliente();

-- 2) storico_pratiche_legali: null-safety sullo store del profilo
DROP POLICY IF EXISTS "Storico pratiche: visibilità per ruolo" ON public.storico_pratiche_legali;

CREATE POLICY "Storico pratiche: visibilità per ruolo"
ON public.storico_pratiche_legali
FOR SELECT
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR pratica_id IN (
    SELECT pl.id
    FROM public.pratiche_legali pl
    JOIN public.clienti c ON c.id = pl.cliente_id
    JOIN public.profili p ON p.id = auth.uid()
    WHERE p.store_id IS NOT NULL
      AND c.store_id IS NOT NULL
      AND c.store_id = p.store_id
  )
);

-- 3) bucket database_export_06_07_26: accesso ai soli amministratori
DROP POLICY IF EXISTS "Database export: select admin" ON storage.objects;
DROP POLICY IF EXISTS "Database export: insert admin" ON storage.objects;
DROP POLICY IF EXISTS "Database export: update admin" ON storage.objects;
DROP POLICY IF EXISTS "Database export: delete admin" ON storage.objects;

CREATE POLICY "Database export: select admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'database_export_06_07_26' AND public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Database export: insert admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'database_export_06_07_26' AND public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Database export: update admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'database_export_06_07_26' AND public.has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (bucket_id = 'database_export_06_07_26' AND public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Database export: delete admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'database_export_06_07_26' AND public.has_role(auth.uid(), 'amministratore'::app_role));