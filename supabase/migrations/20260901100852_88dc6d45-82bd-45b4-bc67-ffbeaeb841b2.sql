-- 1) Funzioni gate
CREATE OR REPLACE FUNCTION public.auth_ha_accesso_preventivi()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(auth.uid(),'amministratore')
      OR has_role(auth.uid(),'preventivi_manage')
      OR has_role(auth.uid(),'preventivi_write')
      OR has_role(auth.uid(),'preventivi_read');
$$;
REVOKE ALL ON FUNCTION public.auth_ha_accesso_preventivi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_ha_accesso_preventivi() TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.auth_puo_gestire_anagrafiche_prev()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(auth.uid(),'amministratore') OR has_role(auth.uid(),'preventivi_manage');
$$;
REVOKE ALL ON FUNCTION public.auth_puo_gestire_anagrafiche_prev() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_gestire_anagrafiche_prev() TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_preventivo(_agente_codice text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    has_role(auth.uid(),'amministratore')
    OR has_role(auth.uid(),'preventivi_manage')
    OR (
      has_role(auth.uid(),'preventivi_write')
      AND _agente_codice IS NOT NULL
      AND _agente_codice = (SELECT codice_agente FROM public.profili WHERE id = auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION public.auth_puo_scrivere_preventivo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo(text) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_preventivo_id(_preventivo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.preventivi p
    WHERE p.id = _preventivo_id
      AND public.auth_puo_scrivere_preventivo(p.agente_codice)
  );
$$;
REVOKE ALL ON FUNCTION public.auth_puo_scrivere_preventivo_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo_id(uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_blocco(_blocco_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocchi_preventivo b
    JOIN public.preventivi p ON p.id = b.preventivo_id
    WHERE b.id = _blocco_id
      AND public.auth_puo_scrivere_preventivo(p.agente_codice)
  );
$$;
REVOKE ALL ON FUNCTION public.auth_puo_scrivere_blocco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_blocco(uuid) TO authenticated, service_role, supabase_read_only_user;

-- 2) Policy anagrafiche
DO $do$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['articoli','matrice_ricarichi','listini_acquisto','listini_vendita','cantiere_listini_speciali','kit','kit_componenti']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.auth_ha_accesso_preventivi())', t||'_prev_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.auth_puo_gestire_anagrafiche_prev()) WITH CHECK (public.auth_puo_gestire_anagrafiche_prev())', t||'_prev_write', t);
  END LOOP;
END $do$;

-- fornitori: mantiene lettura a tutti gli autenticati (usato anche fuori dal preventivatore)
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='fornitori' LOOP
    EXECUTE format('DROP POLICY %I ON public.fornitori', p.policyname);
  END LOOP;
END $do$;
CREATE POLICY fornitori_select ON public.fornitori FOR SELECT TO authenticated USING (true);
CREATE POLICY fornitori_prev_write ON public.fornitori FOR ALL TO authenticated
  USING (public.auth_puo_gestire_anagrafiche_prev()) WITH CHECK (public.auth_puo_gestire_anagrafiche_prev());

-- contatori_preventivo
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='contatori_preventivo' LOOP
    EXECUTE format('DROP POLICY %I ON public.contatori_preventivo', p.policyname);
  END LOOP;
END $do$;
CREATE POLICY contatori_prev_select ON public.contatori_preventivo FOR SELECT TO authenticated
  USING (public.auth_ha_accesso_preventivi());
CREATE POLICY contatori_prev_write ON public.contatori_preventivo FOR ALL TO authenticated
  USING (public.auth_puo_gestire_anagrafiche_prev() OR has_role(auth.uid(),'preventivi_write'))
  WITH CHECK (public.auth_puo_gestire_anagrafiche_prev() OR has_role(auth.uid(),'preventivi_write'));

-- preventivi
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='preventivi' LOOP
    EXECUTE format('DROP POLICY %I ON public.preventivi', p.policyname);
  END LOOP;
END $do$;
CREATE POLICY preventivi_select ON public.preventivi FOR SELECT TO authenticated
  USING (public.auth_ha_accesso_preventivi());
CREATE POLICY preventivi_insert ON public.preventivi FOR INSERT TO authenticated
  WITH CHECK (public.auth_puo_scrivere_preventivo(agente_codice));
CREATE POLICY preventivi_update ON public.preventivi FOR UPDATE TO authenticated
  USING (public.auth_puo_scrivere_preventivo(agente_codice))
  WITH CHECK (public.auth_puo_scrivere_preventivo(agente_codice));
CREATE POLICY preventivi_delete ON public.preventivi FOR DELETE TO authenticated
  USING (public.auth_puo_scrivere_preventivo(agente_codice));

-- blocchi_preventivo
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='blocchi_preventivo' LOOP
    EXECUTE format('DROP POLICY %I ON public.blocchi_preventivo', p.policyname);
  END LOOP;
END $do$;
CREATE POLICY blocchi_prev_select ON public.blocchi_preventivo FOR SELECT TO authenticated
  USING (public.auth_ha_accesso_preventivi());
CREATE POLICY blocchi_prev_write ON public.blocchi_preventivo FOR ALL TO authenticated
  USING (public.auth_puo_scrivere_preventivo_id(preventivo_id))
  WITH CHECK (public.auth_puo_scrivere_preventivo_id(preventivo_id));

-- righe_preventivo
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='righe_preventivo' LOOP
    EXECUTE format('DROP POLICY %I ON public.righe_preventivo', p.policyname);
  END LOOP;
END $do$;
CREATE POLICY righe_prev_select ON public.righe_preventivo FOR SELECT TO authenticated
  USING (public.auth_ha_accesso_preventivi());
CREATE POLICY righe_prev_write ON public.righe_preventivo FOR ALL TO authenticated
  USING (public.auth_puo_scrivere_blocco(blocco_id))
  WITH CHECK (public.auth_puo_scrivere_blocco(blocco_id));