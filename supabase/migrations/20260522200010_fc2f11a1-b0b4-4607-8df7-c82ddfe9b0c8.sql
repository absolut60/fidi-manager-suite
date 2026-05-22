
-- 1) Rendi privato il bucket firme
UPDATE storage.buckets SET public = false WHERE id = 'firme';

-- 2) Rimuovi eventuali policy pubbliche sul bucket firme e ricreale restrittive
DROP POLICY IF EXISTS "Firme pubbliche in lettura" ON storage.objects;
DROP POLICY IF EXISTS "Public read firme" ON storage.objects;
DROP POLICY IF EXISTS "firme_public_select" ON storage.objects;
DROP POLICY IF EXISTS "Firme: select autenticati" ON storage.objects;
DROP POLICY IF EXISTS "Firme: insert autenticati" ON storage.objects;

CREATE POLICY "Firme: select autenticati"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'firme');

CREATE POLICY "Firme: insert autenticati"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firme');

-- 3) Realtime: limita subscribe ai topic per-utente (notifiche:<auth.uid()>)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Realtime: solo topic propri" ON realtime.messages;
CREATE POLICY "Realtime: solo topic propri"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() = ('notifiche:' || auth.uid()::text)
    OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  );

-- 4) Revoca EXECUTE pubblico sulle funzioni SECURITY DEFINER di trigger/interne
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.richieste_fido_prepare() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.aggiorna_blocco_cliente() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_clienti() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notifica_richiesta() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_richieste_fido() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.crea_richiesta_fido_da_cliente() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.calcola_livello_fido(numeric) FROM anon, public;
