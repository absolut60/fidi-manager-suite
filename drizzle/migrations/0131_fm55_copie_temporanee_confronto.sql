-- FM55 fetta 7: copie TEMPORANEE delle versioni ottimizzate (solo MATERIALIZED sulle CTE intermedie),
-- create da pg_get_functiondef + replace, solo per confrontare le impronte con le funzioni attuali.
-- Solo service_role. Rimosse nella migrazione finale della fetta.
DO $g$
DECLARE
  d text; p text; n int;
  v2_cte text[] := ARRAY['b','b2','b3','b4','b5_originale','freno'];
  v1_cte text[] := ARRAY['fatt','patol','base','calc','fin','ris','tot','fine','pav','nota'];
BEGIN
  IF md5(pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure)) <> '34c0a4c4d66108610579505be0b1a21a'
     OR md5(pg_get_functiondef('public.get_fido_teorico(uuid[],boolean)'::regprocedure)) <> 'd9032ff2c9ec0635e66861cf2272870e' THEN
    RAISE EXCEPTION 'FM55 fetta 7: definizioni diverse da quelle attese';
  END IF;

  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  FOREACH p IN ARRAY v2_cte LOOP
    n := (length(d) - length(replace(d, E'\n  ' || p || ' AS (', ''))) / length(E'\n  ' || p || ' AS (');
    IF n <> 1 THEN RAISE EXCEPTION 'CTE % trovata % volte', p, n; END IF;
    d := replace(d, E'\n  ' || p || ' AS (', E'\n  ' || p || ' AS MATERIALIZED (');
  END LOOP;
  d := replace(d, 'FUNCTION public.get_fido_teorico_v2(', 'FUNCTION public._fm55_nuova_get_fido_teorico_v2(');
  EXECUTE d;

  d := pg_get_functiondef('public.get_fido_teorico(uuid[],boolean)'::regprocedure);
  FOREACH p IN ARRAY v1_cte LOOP
    n := (length(d) - length(replace(d, E'\n  ' || p || ' AS (', ''))) / length(E'\n  ' || p || ' AS (');
    IF n <> 1 THEN RAISE EXCEPTION 'CTE % trovata % volte', p, n; END IF;
    d := replace(d, E'\n  ' || p || ' AS (', E'\n  ' || p || ' AS MATERIALIZED (');
  END LOOP;
  d := replace(d, 'FUNCTION public.get_fido_teorico(', 'FUNCTION public._fm55_nuova_get_fido_teorico(');
  EXECUTE d;
END $g$;
REVOKE EXECUTE ON FUNCTION public._fm55_nuova_get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fm55_nuova_get_fido_teorico_v2(uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public._fm55_nuova_get_fido_teorico(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fm55_nuova_get_fido_teorico(uuid[], boolean) TO service_role;