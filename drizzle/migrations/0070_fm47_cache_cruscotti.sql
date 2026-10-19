-- 1) Motori: copie identiche delle funzioni attuali con suffisso _calcolo
DO $mig$
DECLARE v_nome text; v_n int; v_oid oid; v_def text;
BEGIN
  FOREACH v_nome IN ARRAY ARRAY['get_dso_aggregato','get_dso_serie_mensile','get_dashboard_fatturato'] LOOP
    SELECT count(*), min(p.oid) INTO v_n, v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = v_nome;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FM47: % trovata % volte', v_nome, v_n; END IF;
    v_def := pg_get_functiondef(v_oid);
    IF position('FUNCTION public.'||v_nome||'(' in v_def) = 0 THEN RAISE EXCEPTION 'FM47: intestazione inattesa per %', v_nome; END IF;
    EXECUTE replace(v_def, 'FUNCTION public.'||v_nome||'(', 'FUNCTION public.'||v_nome||'_calcolo(');
  END LOOP;
END
$mig$;
REVOKE EXECUTE ON FUNCTION public.get_dso_aggregato_calcolo(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dso_serie_mensile_calcolo(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_fatturato_calcolo(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Tabella dei risultati pronti (letta solo dalle funzioni SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.cache_cruscotti (
  chiave text NOT NULL,
  ambito text NOT NULL,          -- 'tutti' oppure store_id
  dati jsonb NOT NULL,
  calcolato_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chiave, ambito)
);
ALTER TABLE public.cache_cruscotti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cache_cruscotti FROM anon, authenticated;

-- 3) Ambiti da calcolare e ricalcolo di una voce (solo processi interni, senza utente)
CREATE OR REPLACE FUNCTION public.ambiti_cache_cruscotti()
 RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT 'tutti' UNION ALL SELECT id::text FROM public.stores $f$;

CREATE OR REPLACE FUNCTION public.refresh_cache_cruscotti(_chiave text, _ambito text)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_store uuid; v_dati jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'refresh_cache_cruscotti: solo processi interni'; END IF;
  v_store := CASE WHEN _ambito = 'tutti' THEN NULL ELSE _ambito::uuid END;
  IF _chiave = 'dso_aggregato' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_dati FROM public.get_dso_aggregato_calcolo(NULL, v_store, NULL, NULL) x;
  ELSIF _chiave = 'dso_serie_24' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.mese), '[]'::jsonb) INTO v_dati FROM public.get_dso_serie_mensile_calcolo(NULL, v_store, 24) x;
  ELSIF _chiave = 'dashboard_fatturato' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_dati FROM public.get_dashboard_fatturato_calcolo(v_store) x;
  ELSE
    RAISE EXCEPTION 'refresh_cache_cruscotti: chiave sconosciuta %', _chiave;
  END IF;
  INSERT INTO public.cache_cruscotti (chiave, ambito, dati, calcolato_at)
  VALUES (_chiave, _ambito, v_dati, now())
  ON CONFLICT (chiave, ambito) DO UPDATE SET dati = EXCLUDED.dati, calcolato_at = EXCLUDED.calcolato_at;
END
$f$;
REVOKE EXECUTE ON FUNCTION public.ambiti_cache_cruscotti() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_cache_cruscotti(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ambiti_cache_cruscotti() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_cache_cruscotti(text, text) TO service_role;

-- 4) Funzioni pubbliche: risultato pronto per la chiamata standard, altrimenti motore dal vivo
CREATE OR REPLACE FUNCTION public.get_dso_aggregato(_cliente_id uuid DEFAULT NULL::uuid, _store_id uuid DEFAULT NULL::uuid, _data_da date DEFAULT NULL::date, _data_a date DEFAULT NULL::date)
 RETURNS TABLE(all_teorico_pond numeric, all_teorico_medio numeric, all_reale_pond numeric, all_reale_medio numeric, all_scollamento_pond numeric, all_scollamento_medio numeric, all_n bigint, all_importo numeric, cred_teorico_pond numeric, cred_teorico_medio numeric, cred_reale_pond numeric, cred_reale_medio numeric, cred_scollamento_pond numeric, cred_scollamento_medio numeric, cred_n bigint, cred_importo numeric, n_anticipo bigint, n_puntuali bigint, n_ritardo bigint, importo_anticipo numeric, importo_puntuali numeric, importo_ritardo numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_s uuid; v_j jsonb;
BEGIN
  IF _cliente_id IS NULL AND _data_da IS NULL AND _data_a IS NULL THEN
    v_s := public.store_id_effettivo(_store_id);
    SELECT c.dati INTO v_j FROM public.cache_cruscotti c WHERE c.chiave = 'dso_aggregato' AND c.ambito = COALESCE(v_s::text, 'tutti');
    IF FOUND THEN
      RETURN QUERY SELECT * FROM jsonb_to_recordset(v_j) AS x(all_teorico_pond numeric, all_teorico_medio numeric, all_reale_pond numeric, all_reale_medio numeric, all_scollamento_pond numeric, all_scollamento_medio numeric, all_n bigint, all_importo numeric, cred_teorico_pond numeric, cred_teorico_medio numeric, cred_reale_pond numeric, cred_reale_medio numeric, cred_scollamento_pond numeric, cred_scollamento_medio numeric, cred_n bigint, cred_importo numeric, n_anticipo bigint, n_puntuali bigint, n_ritardo bigint, importo_anticipo numeric, importo_puntuali numeric, importo_ritardo numeric);
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_dso_aggregato_calcolo(_cliente_id, _store_id, _data_da, _data_a);
END
$f$;

CREATE OR REPLACE FUNCTION public.get_dso_serie_mensile(_cliente_id uuid DEFAULT NULL::uuid, _store_id uuid DEFAULT NULL::uuid, _mesi_indietro integer DEFAULT 24)
 RETURNS TABLE(mese date, all_teorico numeric, all_reale numeric, cred_teorico numeric, cred_reale numeric, n_scadenze bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_s uuid; v_j jsonb;
BEGIN
  IF _cliente_id IS NULL AND _mesi_indietro = 24 THEN
    v_s := public.store_id_effettivo(_store_id);
    SELECT c.dati INTO v_j FROM public.cache_cruscotti c WHERE c.chiave = 'dso_serie_24' AND c.ambito = COALESCE(v_s::text, 'tutti');
    IF FOUND THEN
      RETURN QUERY SELECT x.mese, x.all_teorico, x.all_reale, x.cred_teorico, x.cred_reale, x.n_scadenze
        FROM jsonb_to_recordset(v_j) AS x(mese date, all_teorico numeric, all_reale numeric, cred_teorico numeric, cred_reale numeric, n_scadenze bigint)
        ORDER BY x.mese;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_dso_serie_mensile_calcolo(_cliente_id, _store_id, _mesi_indietro);
END
$f$;

CREATE OR REPLACE FUNCTION public.get_dashboard_fatturato(_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tipo text, anno integer, num_clienti bigint, num_fatture bigint, fatturato numeric, ytd_alla_data date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_s uuid; v_j jsonb;
BEGIN
  v_s := public.store_id_effettivo(_store_id);
  SELECT c.dati INTO v_j FROM public.cache_cruscotti c WHERE c.chiave = 'dashboard_fatturato' AND c.ambito = COALESCE(v_s::text, 'tutti');
  IF FOUND THEN
    RETURN QUERY SELECT * FROM jsonb_to_recordset(v_j) AS x(tipo text, anno integer, num_clienti bigint, num_fatture bigint, fatturato numeric, ytd_alla_data date);
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.get_dashboard_fatturato_calcolo(_store_id);
END
$f$;

REVOKE EXECUTE ON FUNCTION public.get_dso_aggregato(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dso_serie_mensile(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_fatturato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dso_aggregato(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dso_serie_mensile(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fatturato(uuid) TO authenticated;