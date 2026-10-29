DO $mig$
DECLARE
  r record; d text; n int;
  a_old text := 'public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, ';
  a_new text := 'public.categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, ';
  b_old text := E'        WHEN s.data_pagamento_effettiva IS NOT NULL THEN ''pagato''\n';
  b_new text := E'        WHEN s.data_pagamento_effettiva IS NOT NULL THEN ''pagato''\n        WHEN public.scadenza_chiusa_anticipata(s.stato_contabile, s.data_pagamento_effettiva, s.tempi_scadenza_key, s.importo_pagato) THEN ''pagato''\n';
  c_old text := 's.data_pagamento_effettiva IS NULL';
  c_new text := 's.data_pagamento_effettiva IS NULL AND NOT public.scadenza_chiusa_anticipata(s.stato_contabile, s.data_pagamento_effettiva, s.tempi_scadenza_key, s.importo_pagato)';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('scadenziario_clienti_base','cd026ee389fef8e4630e5825f798d317','a',1),
    ('get_scadenziario_totali','c8546bb3251c943cb4fd647555f7c833','a',1),
    ('get_scadenziario_lista_paginata','89c10d37f49a8e0c166884f3bc5f6db5','a',1),
    ('clienti_scaduto_oltre_60','b666efe22f543c92b2655fbe66e63ac8','a',1),
    ('promesse_attive_importo_efficace','de074e72f3733f2c6423e71b4a05c73f','a',1),
    ('get_clienti_scadenziario','36269e20827eec27648b71f8a20183c6','b',1),
    ('genera_snapshot','fa0f85b9cb23eb1ce184a7708c8ea644','b',3),
    ('get_promemoria_clienti_aggregato','eb2d2b1c4f9b9873aa4580e5e3653a4c','c',1),
    ('get_promemoria_scadenze_dettaglio','e5d11f016a74d51e44385ba26ba49a3d','c',1),
    ('get_dashboard_fidi','a8526919fd4cbdd8b378cd1e417148cf','c',1)
  ) v(fn, h, k, cnt) LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.proname = r.fn AND p.pronamespace = 'public'::regnamespace;
    IF md5(d) <> r.h THEN RAISE EXCEPTION 'FM54: corpo inatteso per %', r.fn; END IF;
    IF r.k = 'a' THEN
      n := (length(d) - length(replace(d, a_old, ''))) / length(a_old); d := replace(d, a_old, a_new);
      d := regexp_replace(d, '(categoria_scadenza_riga\(s\.stato_contabile, s\.data_scadenza, s\.data_pagamento_effettiva, s\.giorni_ritardo, (v_today|CURRENT_DATE))\)', '\1, s.tempi_scadenza_key, s.importo_pagato)', 'g');
      IF position('categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, v_today, s.tempi_scadenza_key, s.importo_pagato)' IN d) = 0
         AND position('categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE, s.tempi_scadenza_key, s.importo_pagato)' IN d) = 0 THEN
        RAISE EXCEPTION 'FM54: sostituzione incompleta in %', r.fn; END IF;
    ELSIF r.k = 'b' THEN
      n := (length(d) - length(replace(d, b_old, ''))) / length(b_old); d := replace(d, b_old, b_new);
    ELSE
      n := (length(d) - length(replace(d, c_old, ''))) / length(c_old); d := replace(d, c_old, c_new);
    END IF;
    IF n <> r.cnt THEN RAISE EXCEPTION 'FM54: % occorrenze in % (attese %)', n, r.fn, r.cnt; END IF;
    EXECUTE d;
  END LOOP;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.clienti_scaduto_oltre_60() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genera_snapshot(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clienti_scaduto_oltre_60() TO service_role;
GRANT EXECUTE ON FUNCTION public.genera_snapshot(date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.scadenziario_clienti_base(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scadenziario_clienti_base(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_totali(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_totali(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,integer,integer,text,text,integer,integer,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,integer,integer,text,text,integer,integer,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.promesse_attive_importo_efficace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promesse_attive_importo_efficace() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_clienti_scadenziario(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_scadenziario(uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid[],text,numeric,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid[],text,numeric,boolean,boolean,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_promemoria_scadenze_dettaglio(date,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promemoria_scadenze_dettaglio(date,boolean,boolean,boolean,boolean,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi() TO authenticated, service_role, supabase_read_only_user;