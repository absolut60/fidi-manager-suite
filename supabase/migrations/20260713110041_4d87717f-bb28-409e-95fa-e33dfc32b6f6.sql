-- Estende user_can_access_cliente con il ramo agente (lettura)
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _cliente_id IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clienti c
      JOIN public.profili p ON p.id = auth.uid()
      WHERE c.id = _cliente_id AND c.store_id IS NOT NULL AND c.store_id = p.store_id
    )
    OR EXISTS (
      SELECT 1 FROM public.clienti c
      JOIN public.profili p ON p.id = auth.uid()
      WHERE c.id = _cliente_id
        AND public.has_role(auth.uid(), 'agente'::app_role)
        AND p.codice_agente IS NOT NULL
        AND c.codice_agente = p.codice_agente
    )
  );
$function$;

-- Estende la policy SELECT su clienti col ramo agente
DROP POLICY IF EXISTS "Visibilità clienti per ruolo" ON public.clienti;
CREATE POLICY "Visibilità clienti per ruolo"
ON public.clienti
FOR SELECT
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (store_id IN (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid()))
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente IN (
      SELECT p.codice_agente FROM profili p
      WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL
    )
  )
);