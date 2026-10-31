-- FM55: spiegazione del fido teorico con il dettaglio degli impegni aperti
-- (scaduto · a scadere · DDT da fatturare · ordini da evadere) al posto della cifra unica. Solo testo.
CREATE OR REPLACE FUNCTION public.testo_impegni_fido(_esp numeric, _ord numeric, _scaduto numeric, _ddt numeric, _con_ordini boolean)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  -- Esposizione (totale_rischio) = scaduto + a scadere + DDT da fatturare; ordini = doc_da_evadere.
  -- Voci arrotondate all'euro, mostrate solo se > 0; il totale è la somma delle voci mostrate.
  WITH v AS (
    SELECT round(GREATEST(COALESCE(_scaduto,0),0)) AS a,
           round(GREATEST(COALESCE(_esp,0) - GREATEST(COALESCE(_scaduto,0),0) - GREATEST(COALESCE(_ddt,0),0), 0)) AS b,
           round(GREATEST(COALESCE(_ddt,0),0)) AS c,
           CASE WHEN _con_ordini THEN round(GREATEST(COALESCE(_ord,0),0)) ELSE 0 END AS d
  ), f AS (
    SELECT v.*, (a+b+c+d) AS x FROM v
  )
  SELECT CASE WHEN x <= 0 THEN '' ELSE
    'Impegni aperti ' || replace(to_char(x, 'FM999,999,999'), ',', '.') || ' €: '
    || array_to_string(ARRAY[
         CASE WHEN a > 0 THEN 'scaduto ' || replace(to_char(a, 'FM999,999,999'), ',', '.') || ' €' END,
         CASE WHEN b > 0 THEN 'a scadere ' || replace(to_char(b, 'FM999,999,999'), ',', '.') || ' €' END,
         CASE WHEN c > 0 THEN 'DDT da fatturare ' || replace(to_char(c, 'FM999,999,999'), ',', '.') || ' €' END,
         CASE WHEN d > 0 THEN 'ordini da evadere ' || replace(to_char(d, 'FM999,999,999'), ',', '.') || ' €' END
       ], ' · ')
  END FROM f
$$;
REVOKE EXECUTE ON FUNCTION public.testo_impegni_fido(numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.testo_impegni_fido(numeric, numeric, numeric, numeric, boolean) TO authenticated, service_role;

DO $do$
DECLARE d text;
  o1 text := $t$               || CASE WHEN r.fp > 0 THEN ' Ha ancora ' || replace(to_char(round(r.esp + r.ord), 'FM999,999,999'), ',', '.') || ' € da pagare: il fido copre solo quello.' ELSE '' END$t$; n1 text := $t$               || CASE WHEN r.fp > 0 THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol) || ': il fido copre questi impegni.' ELSE '' END$t$;
  o2 text := $t$               || CASE WHEN r.fp > r.base_v THEN ' Deve già ' || replace(to_char(round(r.fabb), 'FM999,999,999'), ',', '.') || ' €: il fido copre quello.' ELSE '' END$t$; n2 text := $t$               || CASE WHEN r.fp > r.base_v THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol) || ': il fido copre questi impegni.' ELSE '' END$t$;
  o3 text := $t$            || 'Oggi ci deve ' || replace(to_char(round(r.esp), 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.patol THEN '' WHEN r.ord > 0
                 THEN ' e ha ordini aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €' ELSE '' END
            || ': per servirlo servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €.'$t$; n3 text := $t$            || COALESCE(NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol), ''), 'Nessun impegno aperto')
            || ': per servirlo servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €.'$t$;
BEGIN
  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  IF (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 THEN RAISE EXCEPTION 'get_fido_teorico_v2: frammento perso non trovato'; END IF;
  IF (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 THEN RAISE EXCEPTION 'get_fido_teorico_v2: frammento nuovo non trovato'; END IF;
  IF (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 THEN RAISE EXCEPTION 'get_fido_teorico_v2: frammento calcolo non trovato'; END IF;
  EXECUTE replace(replace(replace(d, o1, n1), o2, n2), o3, n3);
END
$do$;

REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;