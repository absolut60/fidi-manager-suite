-- FM55 fetta 7: funzione TEMPORANEA di sola misura (EXPLAIN ANALYZE, BUFFERS).
-- Esegue l'istruzione in una sottotransazione annullata sempre: nessuna scrittura resta.
-- Solo service_role. Verrà rimossa nella migrazione di ottimizzazione.
CREATE OR REPLACE FUNCTION public._fm55_diag_explain(_sql text)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r text; v text[] := ARRAY[]::text[];
BEGIN
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;
  BEGIN
    FOR r IN EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE false) ' || _sql LOOP
      v := v || r;
    END LOOP;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback diagnostica';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
  END;
  RETURN QUERY SELECT unnest(v);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._fm55_diag_explain(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fm55_diag_explain(text) TO service_role;