-- Sola lettura: ogni riga deve restituire ok=true.
WITH expected(tablename, cmd, policyname, predicate) AS (
  VALUES
    ('cantieri','SELECT','Preventivisti: cantieri SELECT','( SELECT auth_preventivista() AS auth_preventivista)'),
    ('cantieri','INSERT','Preventivisti: cantieri INSERT propri','(( SELECT auth_preventivista() AS auth_preventivista) AND (created_by = auth.uid()))'),
    ('cantieri','UPDATE','Preventivisti: cantieri UPDATE propri','(( SELECT auth_preventivista() AS auth_preventivista) AND (created_by = auth.uid()))'),
    ('contatti','SELECT','Preventivisti: contatti SELECT clienti e lead','(( SELECT auth_preventivista() AS auth_preventivista) AND ((cliente_id IS NOT NULL) OR (lead_id IS NOT NULL)))'),
    ('contatti','INSERT','Preventivisti: contatti INSERT propri clienti e lead','(( SELECT auth_preventivista() AS auth_preventivista) AND ((cliente_id IS NOT NULL) OR (lead_id IS NOT NULL)) AND (created_by = auth.uid()))'),
    ('contatti','UPDATE','Preventivisti: contatti UPDATE propri clienti e lead','(( SELECT auth_preventivista() AS auth_preventivista) AND ((cliente_id IS NOT NULL) OR (lead_id IS NOT NULL)) AND (created_by = auth.uid()))'),
    ('lead','SELECT','Preventivisti: lead SELECT','( SELECT auth_preventivista() AS auth_preventivista)'),
    ('lead','INSERT','Preventivisti: lead INSERT propri','(( SELECT auth_preventivista() AS auth_preventivista) AND (created_by = auth.uid()))'),
    ('lead','UPDATE','Preventivisti: lead UPDATE propri','(( SELECT auth_preventivista() AS auth_preventivista) AND (created_by = auth.uid()))')
)
SELECT e.policyname AS test, EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=e.tablename AND p.cmd=e.cmd
    AND p.policyname=e.policyname AND p.permissive='PERMISSIVE'
    AND p.roles=ARRAY['authenticated']::name[]
    AND p.qual IS NOT DISTINCT FROM CASE WHEN e.cmd='INSERT' THEN NULL ELSE e.predicate END
    AND p.with_check IS NOT DISTINCT FROM CASE WHEN e.cmd='SELECT' THEN NULL ELSE e.predicate END
) AS ok FROM expected e
UNION ALL
SELECT 'Solo nove policy, nessuna clienti/DELETE',
  (SELECT count(*)=9 FROM pg_policies WHERE policyname LIKE 'Preventivisti:%')
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'Preventivisti:%' AND (tablename NOT IN ('cantieri','contatti','lead') OR cmd='DELETE'))
UNION ALL
SELECT 'Default autore auth.uid() su tutte e tre',
  (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('cantieri','contatti','lead') AND column_name='created_by' AND column_default='auth.uid()')
UNION ALL
SELECT 'Helper: esattamente write/manage, STABLE SECURITY DEFINER, search_path public',
  EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.auth_preventivista()'::regprocedure
    AND provolatile='s' AND prosecdef AND proconfig=ARRAY['search_path=public']
    AND regexp_replace(prosrc,'\s+',' ','g') = ' SELECT EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN (''preventivi_write'', ''preventivi_manage'') ) ')
UNION ALL
SELECT 'Grant authenticated/service_role, anon e PUBLIC esclusi',
  has_function_privilege('authenticated','public.auth_preventivista()','EXECUTE')
  AND has_function_privilege('service_role','public.auth_preventivista()','EXECUTE')
  AND NOT has_function_privilege('anon','public.auth_preventivista()','EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.auth_preventivista()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')
UNION ALL
SELECT 'Tutte le policy preesistenti invariate',
  (SELECT md5(string_agg(row_to_json(p)::text,E'\n' ORDER BY schemaname,tablename,policyname)) FROM pg_policies p WHERE policyname NOT LIKE 'Preventivisti:%')='3fce28909a60ee16568db1feb3d8fe27'
UNION ALL
SELECT 'Tutte le funzioni preesistenti invariate',
  (SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname<>'auth_preventivista')='876f62e42e00411ee0d225e2af99c08e';