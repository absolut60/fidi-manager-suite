-- 1) genera_snapshot: guardia interna + revoca esecuzione diretta
CREATE OR REPLACE FUNCTION public.genera_snapshot(_data date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  -- Guardia: solo service_role (processi interni) o amministratore
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'amministratore') THEN
    RAISE EXCEPTION 'Permesso negato: solo gli amministratori possono generare gli snapshot';
  END IF;

  _id := public.genera_snapshot_impl(_data);
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.genera_snapshot(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.genera_snapshot(date) TO service_role;

-- 2) registra_consensi_batch: revoca esecuzione diretta dai client
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registra_consensi_batch'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
