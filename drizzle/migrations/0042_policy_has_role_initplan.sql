-- FM44 prestazioni: has_role(auth.uid(), ruolo) nelle policy valutata una volta per query (initPlan).
-- Semantica identica. Esclude policy RESTRICTIVE e occorrenze già incapsulate.
DO $$
DECLARE
  p record;
  pat constant text := '(?<!SELECT )has_role\(auth\.uid\(\), (''[a-z_0-9]+''::app_role)\)';
  rep constant text := '(SELECT has_role((SELECT auth.uid()), \1))';
  nq text; nc text; sql text;
  n int := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND permissive = 'PERMISSIVE'
       AND (COALESCE(qual,'') ~ pat OR COALESCE(with_check,'') ~ pat)
  LOOP
    nq := CASE WHEN p.qual IS NULL THEN NULL ELSE regexp_replace(p.qual, pat, rep, 'g') END;
    nc := CASE WHEN p.with_check IS NULL THEN NULL ELSE regexp_replace(p.with_check, pat, rep, 'g') END;
    sql := format('ALTER POLICY %I ON public.%I', p.policyname, p.tablename);
    IF nq IS NOT NULL THEN sql := sql || format(' USING (%s)', nq); END IF;
    IF nc IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', nc); END IF;
    EXECUTE sql;
    n := n + 1;
  END LOOP;
  IF n <> 173 THEN
    RAISE EXCEPTION 'Policy modificate % invece delle 173 attese', n;
  END IF;
  RAISE NOTICE 'Policy modificate: %', n;
END
$$;