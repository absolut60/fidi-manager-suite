-- FM44 fetta 2: secondo fattore obbligatorio per gli amministratori, imposto dal database.

-- Sicurezza: se il proprietario delle funzioni non può leggere auth.mfa_factors la migrazione fallisce qui
-- (meglio fallire ora che bloccare tutte le tabelle con un errore di permesso).
DO $$ BEGIN PERFORM 1 FROM auth.mfa_factors LIMIT 1; END $$;

CREATE OR REPLACE FUNCTION public.auth_mfa_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN true
    WHEN coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' THEN true
    ELSE NOT EXISTS (
           SELECT 1 FROM auth.mfa_factors f
           WHERE f.user_id = auth.uid() AND f.status = 'verified'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid() AND ur.role = 'amministratore'
         )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.auth_mfa_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_mfa_ok() TO authenticated, service_role;

COMMENT ON FUNCTION public.auth_mfa_ok() IS
  'FM44 secondo fattore: true per server/servizio (auth.uid() NULL), per sessioni aal2, oppure per utenti senza fattore verificato e non amministratori. Gemello TS: obbligatorio()/serveAttivazione() in src/lib/secondo-fattore.ts.';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    ) THEN false
    WHEN _role <> 'amministratore' OR _user_id IS DISTINCT FROM auth.uid() THEN true
    ELSE public.auth_mfa_ok()
  END
$$;

COMMENT ON FUNCTION public.has_role(uuid, app_role) IS
  'Verifica ruolo. FM44: per il ruolo amministratore dell''utente corrente risponde true solo se anche auth_mfa_ok() è vero (secondo fattore).';

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity
      AND c.relname NOT IN ('profili', 'user_roles', 'configurazioni')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()))',
      'Secondo fattore (FM44)', t.relname);
    EXECUTE format(
      'COMMENT ON POLICY %I ON public.%I IS %L',
      'Secondo fattore (FM44)', t.relname,
      'FM44: blocca l''accesso agli amministratori (e a chi ha un fattore verificato) finché la sessione non è aal2. Vedi public.auth_mfa_ok().');
  END LOOP;
END $$;