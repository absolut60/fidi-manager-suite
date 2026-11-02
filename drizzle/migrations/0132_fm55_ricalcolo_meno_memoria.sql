-- FM55 fetta 7: meno memoria nel ricalcolo del fido teorico, RISULTATI IDENTICI.
-- Le CTE intermedie non materializzate venivano espanse dal pianificatore a ogni riferimento
-- (get_fido_teorico_v2: 672 sottopiani e ~74 MB solo per pianificare 200 clienti; get_fido_teorico: ~21 MB).
-- Si aggiunge solo MATERIALIZED alle CTE intermedie (pg_get_functiondef + replace, guardia md5):
-- stesse firme, stessi calcoli (solo funzioni STABLE/IMMUTABLE). Impronta md5 su 12.909 clienti identica.
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
  EXECUTE d;

  d := pg_get_functiondef('public.get_fido_teorico(uuid[],boolean)'::regprocedure);
  FOREACH p IN ARRAY v1_cte LOOP
    n := (length(d) - length(replace(d, E'\n  ' || p || ' AS (', ''))) / length(E'\n  ' || p || ' AS (');
    IF n <> 1 THEN RAISE EXCEPTION 'CTE % trovata % volte', p, n; END IF;
    d := replace(d, E'\n  ' || p || ' AS (', E'\n  ' || p || ' AS MATERIALIZED (');
  END LOOP;
  EXECUTE d;

  -- la nuova definizione deve coincidere con la copia confrontata
  IF replace(pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure), 'public.get_fido_teorico_v2(', 'public._fm55_nuova_get_fido_teorico_v2(')
       <> pg_get_functiondef('public._fm55_nuova_get_fido_teorico_v2(uuid[])'::regprocedure)
     OR replace(pg_get_functiondef('public.get_fido_teorico(uuid[],boolean)'::regprocedure), 'public.get_fido_teorico(', 'public._fm55_nuova_get_fido_teorico(')
       <> pg_get_functiondef('public._fm55_nuova_get_fido_teorico(uuid[],boolean)'::regprocedure) THEN
    RAISE EXCEPTION 'FM55 fetta 7: definizione applicata diversa dalla copia confrontata';
  END IF;
END $g$;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) TO authenticated, service_role;