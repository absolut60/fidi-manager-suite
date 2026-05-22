
-- 1) Fix Security Definer View: imposta security_invoker sulla vista riepilogo_insoluti
ALTER VIEW public.riepilogo_insoluti SET (security_invoker = true);

-- 2) Bucket pubblico: rendi documenti-privacy privato e sostituisci la policy SELECT broad
UPDATE storage.buckets SET public = false WHERE id = 'documenti-privacy';

DROP POLICY IF EXISTS "Public read documenti-privacy" ON storage.objects;

CREATE POLICY "DocumentiPrivacy: autenticati leggono"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documenti-privacy');

-- 3) Revoca EXECUTE da anon e authenticated per le funzioni SECURITY DEFINER
--    che non devono essere esposte via PostgREST (trigger functions e helper interni).
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_clienti() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_richieste_fido() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notifica_richiesta() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.richieste_fido_prepare() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aggiorna_blocco_cliente() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calcola_livello_fido(numeric) FROM anon, authenticated, PUBLIC;

-- has_role e get_user_role sono usate nelle policy RLS: revoca da anon ma mantieni
-- accessibili agli authenticated (necessario per la valutazione RLS lato PostgREST).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
