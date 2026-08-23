-- 1) profili: impedire agli utenti di auto-modificare campi sensibili
DROP POLICY IF EXISTS "Utenti aggiornano il proprio profilo" ON public.profili;
CREATE POLICY "Utenti aggiornano il proprio profilo"
ON public.profili FOR UPDATE
TO authenticated
USING ((auth.uid() = id) OR has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    auth.uid() = id
    AND NOT EXISTS (
      SELECT 1 FROM public.profili p
      WHERE p.id = auth.uid()
        AND (
          p.store_id IS DISTINCT FROM profili.store_id
          OR p.codice_agente IS DISTINCT FROM profili.codice_agente
          OR p.attivo IS DISTINCT FROM profili.attivo
          OR p.email IS DISTINCT FROM profili.email
        )
    )
  )
);

-- 2) user_can_write_cliente: allinea il ramo 'agente' a user_can_access_cliente
CREATE OR REPLACE FUNCTION public.user_can_write_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _cliente_id IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
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

-- 3) tracking clic: la RPC SECURITY DEFINER deve essere eseguibile solo lato server
REVOKE ALL ON FUNCTION public.registra_clic_campagna(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_clic_campagna(text, text, text, text) TO service_role;