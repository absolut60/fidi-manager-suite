-- 1. Fix bridge policy on azioni_recupero_scadenze
DROP POLICY IF EXISTS "Ponte azione-scadenza eredita visibilità" ON public.azioni_recupero_scadenze;

CREATE POLICY "Ponte azione-scadenza eredita visibilità"
ON public.azioni_recupero_scadenze
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.azioni_recupero a
    WHERE a.id = azioni_recupero_scadenze.azione_id
      AND public.user_can_access_cliente(a.cliente_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.azioni_recupero a
    WHERE a.id = azioni_recupero_scadenze.azione_id
      AND public.user_can_access_cliente(a.cliente_id)
  )
);

-- 2. Recreate views with security_invoker
ALTER VIEW public.fatturato_annuale_globale SET (security_invoker = true);
ALTER VIEW public.fatturato_ytd_globale SET (security_invoker = true);

-- 3. Fix mutable search_path on functions
CREATE OR REPLACE FUNCTION public.calcola_scaduto(_ssa numeric, _ant numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(COALESCE(_ssa, 0) - COALESCE(_ant, 0), LEAST(COALESCE(_ssa, 0), 0));
$function$;

CREATE OR REPLACE FUNCTION public.is_anticipo(_numero_documento text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(_numero_documento, '') ILIKE '%ANTICIPO%';
$function$;