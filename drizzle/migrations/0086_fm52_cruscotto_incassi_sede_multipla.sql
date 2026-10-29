-- FM52: Cruscotto incassi, filtro Sede a scelta multipla.
-- _store_id uuid -> _store_ids uuid[] (stessa posizione, DEFAULT NULL; NULL o elenco vuoto = tutte).
-- Corpi ricreati da pg_get_functiondef cambiando solo firma, CTE eff e condizione sulla sede.
-- La visibilità resta quella di store_id_effettivo(), applicata a ogni elemento:
--   elenco vuoto -> store_id_effettivo(NULL) (NULL = tutte per i ruoli globali, sede propria per gli altri);
--   elenco pieno -> ARRAY(DISTINCT store_id_effettivo(x)) (ruoli globali: l'elenco; altri: la sede propria).
-- get_incassi_periodo resta plpgsql con RETURN QUERY EXECUTE ... USING (FM47).
DO $mig$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_param text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('get_cruscotto_incassi_mensile', 'integer,uuid', '_store_id', 1),
    ('get_cruscotto_incassi_mese_dettaglio', 'integer,integer,uuid', '_store_id', 1),
    ('get_cruscotto_incassi_mese_scadenze', 'integer,integer,uuid', '_store_id', 1),
    ('get_incassi_periodo', 'date,date,text,text[],uuid', '$5', 1),
    ('get_incassi_periodo_dettaglio', 'date,date,uuid,text[],uuid', '_store_id', 1)
  ) AS t(fn, args, p, n) LOOP
    v_def := pg_get_functiondef(format('public.%s(%s)', r.fn, r.args)::regprocedure);
    v_param := CASE WHEN r.p = '$5' THEN '$5' ELSE '_store_ids' END;

    IF position('_store_id uuid DEFAULT NULL::uuid' in v_def) = 0
       OR position(format('SELECT public.store_id_effettivo(%s) AS s', r.p) in v_def) = 0
       OR v_def !~ '\(eff\.s IS NULL OR \w+\.store_id = eff\.s\)' THEN
      RAISE EXCEPTION 'FM52: corpo inatteso %', r.fn;
    END IF;
    IF r.fn = 'get_incassi_periodo' AND position('USING _dal, _al, _cliente_search, _metodi, _store_id;' in v_def) = 0 THEN
      RAISE EXCEPTION 'FM52: USING inatteso in get_incassi_periodo';
    END IF;

    v_new := replace(v_def, '_store_id uuid DEFAULT NULL::uuid', '_store_ids uuid[] DEFAULT NULL::uuid[]');
    v_new := replace(v_new, format('SELECT public.store_id_effettivo(%s) AS s', r.p),
      format('SELECT (CASE WHEN %1$s IS NULL OR cardinality(%1$s) = 0 '
          || 'THEN (SELECT CASE WHEN z.e IS NULL THEN NULL::uuid[] ELSE ARRAY[z.e] END FROM (SELECT public.store_id_effettivo(NULL::uuid) AS e) z) '
          || 'ELSE ARRAY(SELECT DISTINCT public.store_id_effettivo(x) FROM unnest(%1$s) AS x) END) AS s', v_param));
    v_new := regexp_replace(v_new, '\(eff\.s IS NULL OR (\w+)\.store_id = eff\.s\)',
      '(eff.s IS NULL OR cardinality(eff.s) = 0 OR \1.store_id = ANY(eff.s))', 'g');
    IF r.fn = 'get_incassi_periodo' THEN
      v_new := replace(v_new, 'USING _dal, _al, _cliente_search, _metodi, _store_id;',
                              'USING _dal, _al, _cliente_search, _metodi, _store_ids;');
    END IF;

    IF v_new ~ '_store_id[^s]' OR position('store_id_effettivo(_store_id)' in v_new) > 0
       OR v_new ~ '= eff\.s\)' THEN
      RAISE EXCEPTION 'FM52: riferimenti residui ai vecchi parametri in %', r.fn;
    END IF;

    EXECUTE format('DROP FUNCTION public.%s(%s)', r.fn, r.args);
    EXECUTE v_new;
  END LOOP;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_cruscotto_incassi_mensile(integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mensile(integer,uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_dettaglio(integer,integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_dettaglio(integer,integer,uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_scadenze(integer,integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_scadenze(integer,integer,uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_incassi_periodo(date,date,text,text[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_incassi_periodo(date,date,text,text[],uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_incassi_periodo_dettaglio(date,date,uuid,text[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_incassi_periodo_dettaglio(date,date,uuid,text[],uuid[]) TO authenticated, service_role;
