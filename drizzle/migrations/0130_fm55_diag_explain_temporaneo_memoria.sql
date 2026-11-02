-- FM55 fetta 7: funzione TEMPORANEA di sola misura; se l'istruzione inizia già con EXPLAIN la usa così com'è
-- (per EXPLAIN (MEMORY)). Sottotransazione sempre annullata. Solo service_role. Rimossa a fine fetta.
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
    FOR r IN EXECUTE CASE WHEN _sql ~* '^\s*EXPLAIN' THEN _sql ELSE 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE false) ' || _sql END LOOP
      v := v || r;
    END LOOP;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback diagnostica';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
  END;
  RETURN QUERY SELECT string_agg(x, E'\n') FROM unnest(v) x;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._fm55_diag_explain(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fm55_diag_explain(text) TO service_role;