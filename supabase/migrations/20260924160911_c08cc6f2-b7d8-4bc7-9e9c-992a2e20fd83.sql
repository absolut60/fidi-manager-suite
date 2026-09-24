DO $mig$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef('public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer, text, text, numeric)'::regprocedure);
  n := (length(d) - length(replace(d, 'THEN f.codice_gestionale END', ''))) / length('THEN f.codice_gestionale END');
  IF n <> 2 THEN RAISE EXCEPTION 'attese 2 occorrenze, trovate %', n; END IF;
  d := replace(d, 'THEN f.codice_gestionale END', 'THEN lpad(COALESCE(f.codice_gestionale,''''), 20, ''0'') END');
  EXECUTE d;
END
$mig$;