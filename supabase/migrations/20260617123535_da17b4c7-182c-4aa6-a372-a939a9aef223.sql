DROP POLICY IF EXISTS "Richieste: insert store o admin" ON public.richieste_fido;

CREATE POLICY "Richieste: insert store o admin"
  ON public.richieste_fido
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by = auth.uid())
    AND (
      public.has_role(auth.uid(), 'amministratore'::app_role)
      OR public.has_role(auth.uid(), 'amministrazione'::app_role)
      OR public.has_role(auth.uid(), 'store_manager'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
      OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    )
  );

-- Consenti all'autore amministrazione di aggiornare la PROPRIA bozza (inviarla in approvazione).
-- La policy esistente gia' copre "(created_by = auth.uid() AND stato = 'bozza')" per qualsiasi ruolo,
-- quindi non serve modificare UPDATE. L'approvazione resta riservata ad amministratore/approvatori liv1-3.

-- Consenti ad amministrazione di vedere TUTTE le richieste (come fanno admin/approvatori),
-- cosi' puo' monitorare lo stato di quelle che ha creato e di quelle del team.
DROP POLICY IF EXISTS "Richieste: visibili admin/approvatori/own store" ON public.richieste_fido;

CREATE POLICY "Richieste: visibili admin/approvatori/own store"
  ON public.richieste_fido
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    OR store_id IN (SELECT profili.store_id FROM public.profili WHERE profili.id = auth.uid())
    OR created_by = auth.uid()
  );