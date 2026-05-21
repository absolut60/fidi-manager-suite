
-- 1. Fix approvazioni SELECT: filtra richieste accessibili
DROP POLICY IF EXISTS "Approvazioni: select come la richiesta" ON public.approvazioni;
CREATE POLICY "Approvazioni: select come la richiesta"
ON public.approvazioni
FOR SELECT
TO authenticated
USING (
  richiesta_id IN (
    SELECT r.id FROM public.richieste_fido r
    WHERE has_role(auth.uid(), 'amministratore'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
       OR r.created_by = auth.uid()
       OR r.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

-- 2. Fix contatti SELECT: filtra clienti accessibili
DROP POLICY IF EXISTS "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente"
ON public.contatti
FOR SELECT
TO authenticated
USING (
  cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(), 'amministratore'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

-- 3. Fix profili INSERT: non-admin non puo' impostare store_id
DROP POLICY IF EXISTS "Admin inserisce profili" ON public.profili;
CREATE POLICY "Admin inserisce profili"
ON public.profili
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (auth.uid() = id AND store_id IS NULL)
);

-- Aggiorna anche UPDATE per evitare che un utente si assegni store_id da solo
DROP POLICY IF EXISTS "Utenti aggiornano il proprio profilo" ON public.profili;
CREATE POLICY "Utenti aggiornano il proprio profilo"
ON public.profili
FOR UPDATE
TO authenticated
USING (auth.uid() = id OR has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (auth.uid() = id AND store_id IS NOT DISTINCT FROM (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
);

-- 4. Function search_path mutable: fix update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 5. Revoke EXECUTE su SECURITY DEFINER functions dagli utenti finali
-- (restano richiamabili dalle RLS policies che le usano)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated;
