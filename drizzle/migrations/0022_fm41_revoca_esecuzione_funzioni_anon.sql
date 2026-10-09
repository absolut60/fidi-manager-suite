DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- Prima il grant esplicito a chi oggi esegue via PUBLIC, poi la revoca: nessun istante senza permesso per gli utenti loggati.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
  END LOOP;
END $$;