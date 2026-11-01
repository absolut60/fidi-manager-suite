-- FM55 fetta 2a, decisione 01/11/2026. Firme invariate, nessun ricalcolo o refresh.
CREATE OR REPLACE FUNCTION public.fido_v2_margine_tetto(_base numeric, _esp numeric, _ord numeric, _acq numeric, _sc_oltre numeric)
RETURNS TABLE(ordini_fuori numeric, valore numeric, tetto numeric, fp numeric, margine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Ordini esclusi dal fido dal 01/11/2026; argomenti conservati per compatibilità.
  WITH cfg AS (
    SELECT COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'),',','.')),'')::numeric, 1.5) tb,
           COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_margine_soglia'),',','.')),'')::numeric, 0.80) ms
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_esp,0) e, cfg.* FROM cfg
  ), w AS (
    SELECT v.*, GREATEST(v.b, v.e / NULLIF(v.ms,0)) AS val FROM v
  )
  SELECT 0::numeric, w.val, w.b * w.tb, public.arrotonda_fido_v2(GREATEST(w.b,w.val)), w.e / NULLIF(w.ms,0) > w.b FROM w
$function$;

DO $migration$
DECLARE d text := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
BEGIN
  IF md5(d) <> '11df79b464fa2721d0cd5fc941079e09' THEN RAISE EXCEPTION 'Definizione inattesa: get_fido_teorico_v2'; END IF;
  d := replace(d, $old$      EXTRACT(day FROM CURRENT_DATE)::numeric AS gg_trascorsi,
      EXTRACT(day FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::numeric AS gg_mese,
$old$, '');
  d := replace(d, $old$      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_giorno_minimo_mese_corrente'), ',', '.')), '')::numeric, 10) AS gmin,
$old$, '');
  d := replace(d, $old$    SELECT cliente_id, min(mese) AS primo_mese, max(mese) AS ultimo_mese FROM fm WHERE imp > 0 GROUP BY cliente_id$old$, $new$    -- I DDT sono acquisti del mese chiuso più recente, anche senza fatture.
    SELECT cliente_id, min(mese) AS primo_mese, max(mese) AS ultimo_mese
    FROM (SELECT cliente_id, mese FROM fm WHERE imp > 0
          UNION ALL SELECT c.id, (cfg.m0 - interval '1 month')::date FROM cli c CROSS JOIN cfg WHERE c.ddt > 0) a
    GROUP BY cliente_id$new$);
  d := replace(d, $old$    SELECT c.id AS cliente_id, ms.mese, ms.i, COALESCE(f.imp, 0) AS imp, p.primo_mese$old$, $new$    SELECT c.id AS cliente_id, ms.mese, ms.i,
      COALESCE(f.imp, 0) + CASE WHEN ms.mese = (cfg.m0 - interval '1 month')::date THEN c.ddt ELSE 0 END AS imp, p.primo_mese$new$);
  d := replace(d, $old$    CROSS JOIN mesi ms
$old$, $new$    CROSS JOIN mesi ms CROSS JOIN cfg
$new$);
  d := replace(d, $old$  rec AS (
    SELECT cliente_id, imp / i AS v,
      row_number() OVER (PARTITION BY cliente_id ORDER BY mese DESC) AS rn
    FROM chiusi WHERE imp > 0
  ),
  corr AS (
    SELECT c.id AS cliente_id,
      COALESCE(f.imp, 0) AS fatt_corr,
      (COALESCE(f.imp, 0) + c.ddt) * cfg.gg_mese / cfg.gg_trascorsi
        / cfg.idx[EXTRACT(month FROM cfg.m0)::int] AS stima
    FROM cli c CROSS JOIN cfg
    LEFT JOIN fm f ON f.cliente_id = c.id AND f.mese = cfg.m0
  ),
  tend AS (
    SELECT x.cliente_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY x.v)::numeric AS tendenza
    FROM (
      SELECT cliente_id, v FROM rec WHERE rn <= 3
      UNION ALL
      -- FM55 fetta 1b: il mese in corso entra nella mediana solo dal giorno gmin
      SELECT k.cliente_id, k.stima FROM corr k, cfg WHERE cfg.gg_trascorsi >= cfg.gmin
    ) x
    WHERE EXISTS (SELECT 1 FROM rec r WHERE r.cliente_id = x.cliente_id)
       OR EXISTS (SELECT 1 FROM corr k, cfg WHERE k.cliente_id = x.cliente_id AND k.stima > 0 AND cfg.gg_trascorsi >= cfg.gmin)
    GROUP BY x.cliente_id
  ),
$old$, $new$  tend AS (
    -- Ultimi tre mesi DI CALENDARIO: gli zeri restano nel denominatore.
    SELECT ch.cliente_id, sum(ch.imp) / NULLIF(sum(ch.i), 0) AS tendenza
    FROM chiusi ch CROSS JOIN cfg
    WHERE ch.mese >= (cfg.m0 - interval '3 months')::date AND ch.mese >= ch.primo_mese
    GROUP BY ch.cliente_id
  ),
  ciclo_fatture AS (
    SELECT s.cliente_id,
      sum(s.dilazione_teorica::numeric * s.importo_scadenza) / NULLIF(sum(s.importo_scadenza), 0) AS ciclo
    FROM public.scadenze s
    WHERE s.cliente_id IN (SELECT id FROM cli)
      AND s.data_documento >= CURRENT_DATE - interval '12 months'
      AND s.data_documento <= CURRENT_DATE
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.importo_scadenza > 0 AND s.dilazione_teorica > 0
    GROUP BY s.cliente_id
  ),
$new$);
  d := replace(d, 'COALESCE(st.fatt12, 0) AS fatt12, k.fatt_corr,', $new$COALESCE(st.fatt12, 0) AS fatt12,
      COALESCE((SELECT f.imp FROM fm f WHERE f.cliente_id = c.id AND f.mese = cfg.m0), 0) AS fatt_corr,$new$);
  d := replace(d, '      CASE WHEN c.gg IS NULL THEN NULL', '      COALESCE(cf.ciclo, CASE WHEN c.gg IS NULL THEN NULL');
  d := replace(d, '           ELSE c.gg::numeric END AS ciclo', '           ELSE c.gg::numeric END) AS ciclo');
  d := replace(d, '    LEFT JOIN corr k ON k.cliente_id = c.id', '    LEFT JOIN ciclo_fatture cf ON cf.cliente_id = c.id');
  d := replace(d, 'COALESCE((b.storico + b.tendenza) / 2, b.storico, b.tendenza, 0)', 'COALESCE((2 * b.storico + b.tendenza) / 3, b.storico, b.tendenza, 0)');
  d := replace(d, 'WHEN b.fatt12 <= 0 AND b.fatt_corr <= 0 THEN', 'WHEN b.fatt12 <= 0 AND b.fatt_corr <= 0 AND b.ddt <= 0 THEN');
  d := replace(d, 'CASE WHEN b3.patol THEN b3.esp ELSE b3.esp + b3.ord END AS fabb', 'b3.esp AS fabb');
  d := replace(d, 'public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol)', 'public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false)');
  d := replace(d, ': il fido copre quanto ci deve e gli ordini aperti.', ': il fido copre quanto ci deve.');
  d := replace(d, $old$               || ' € al mese e paga in circa '
               || CASE WHEN r.mesi_mezzi < 1 THEN round(r.ciclo)::int || ' giorni'
                       WHEN r.mesi_mezzi = floor(r.mesi_mezzi) THEN floor(r.mesi_mezzi)::int || CASE WHEN r.mesi_mezzi = 1 THEN ' mese' ELSE ' mesi' END
                       ELSE floor(r.mesi_mezzi)::int || CASE WHEN floor(r.mesi_mezzi) = 1 THEN ' mese' ELSE ' mesi' END || ' e mezzo' END
$old$, $new$               || ' € al mese e, dalle sue fatture, paga in circa ' || round(r.ciclo)::int || ' giorni'
$new$);
  d := replace(d, ' per scaduto fermo oltre 60 giorni; gli ordini aperti non sono considerati.', ' per scaduto fermo oltre 60 giorni.');
  d := replace(d, ' per insoluti ripetuti; gli ordini aperti non sono considerati.', ' per insoluti ripetuti.');
  d := replace(d, ' per un insoluto con scaduto rilevante; gli ordini aperti non sono considerati.', ' per un insoluto con scaduto rilevante.');
  d := replace(d, $old$            || CASE WHEN r.con_mt AND r.mt_fuori > 0 THEN ' Gli ordini aperti sono molto più di un mese dei suoi acquisti: '
                 || replace(to_char(round(r.mt_fuori), 'FM999,999,999'), ',', '.') || ' € non sono conteggiati, se vuoi coprirli lo autorizzi tu.' ELSE '' END
            || CASE WHEN r.con_mt AND r.mt_valore > r.mt_tetto
                    THEN ' Il sistema da solo non propone più di ' || replace(to_char(round(r.mt_tetto), 'FM999,999,999'), ',', '.')
                         || ' € (una volta e mezza il fido giusto): oltre decide una persona.'
                    ELSE ' Per lavorare tranquillo gli servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €'
                         || CASE WHEN r.con_mt AND r.mt_margine THEN ' (lasciamo un margine del 20%).' ELSE '.' END
               END
$old$, $new$            || ' Per lavorare tranquillo gli servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.con_mt THEN ' (lasciamo un margine del 20%).' ELSE '.' END
$new$);
  d := replace(d, $old$          ) END
    END
  FROM b5 r;$old$, $new$          ) END
    END
    || CASE WHEN r.ord > 0 THEN ' Ha anche ordini clienti aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €'
         || CASE WHEN r.esp + r.ord > r.fp THEN ', che se consegnati supererebbero il fido' ELSE '' END || '.' ELSE '' END
    || CASE WHEN r.fp > public.arrotonda_fido_v2(r.base_v * COALESCE((SELECT NULLIF(trim(replace(valore, ',', '.')), '')::numeric FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'), 1.5))
         THEN ' Sta comprando molto più del solito (oltre una volta e mezza il fido giusto): va autorizzato.' ELSE '' END
  FROM b5 r;$new$);
  EXECUTE d; -- solo CREATE OR REPLACE FUNCTION, non invoca il calcolo
END
$migration$;

CREATE OR REPLACE FUNCTION public.segnalazioni_fido(_regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric, _scaduto_oltre numeric, _pagato_12m numeric, _ordini_fuori numeric, _valore_senza_tetto numeric, _tetto numeric)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Firma invariata. _fabbisogno = esposizione; il chiamante passa il fido proposto
  -- effettivo in _valore_senza_tetto per rispettare anche profili speciali e regole zero.
  -- La colonna valore_senza_tetto continua a contenere mt.valore; _ordini_fuori è ignorato.
  WITH cfg AS (
    SELECT COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) soglia,
           COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) sc_imp,
           COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'),',','.')),'')::numeric, 1.5) tb
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_ordini,0) ord,
           COALESCE(_fido_gamma,0) fg, COALESCE(_scaduto_oltre,0) so, _valore_senza_tetto fp FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.fp > public.arrotonda_fido_v2(v.b * cfg.tb) THEN 'oltre_normale' END,
    CASE WHEN v.fab + v.ord > v.fp THEN 'ordini_oltre_fido' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL) FROM v, cfg
$function$;
CREATE OR REPLACE FUNCTION public.segnalazioni_fido(_regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric, _scaduto_oltre numeric, _pagato_12m numeric)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- DEPRECATED: senza fido proposto non valuta i nuovi confronti. Nessun chiamante attivo.
  -- Delega la parte invariata alla fonte unica; non produce più i vecchi codici.
  SELECT public.segnalazioni_fido(_regola,_base,_fabbisogno,_ordini,_fido_gamma,_scaduto_oltre,_pagato_12m,0,NULL,NULL)
$function$;

DO $migration$
DECLARE d text := pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure);
BEGIN
  IF md5(d) <> 'a671e0937f43944c7edcda68ee77396d' THEN RAISE EXCEPTION 'Definizione inattesa: ricalcola_fido_teorico_blocco'; END IF;
  d := replace(d, $old$ -- FM55 fetta 3A: ordini fuori giro, tetto e valore prima del tetto (fonte unica fido_v2_margine_tetto),
 -- solo per regola calcolo e profili di comportamento; altrimenti 0 / NULL.
 UPDATE public.fido_teorico_cliente f SET
 ordini_fuori=COALESCE(mt.ordini_fuori,0), tetto=mt.tetto, valore_senza_tetto=mt.valore
 FROM public.fido_teorico_cliente f2
 LEFT JOIN LATERAL public.fido_v2_margine_tetto(f2.base,f2.esposizione_corrente,f2.ordini_aperti,f2.acquisto_mensile,f2.scaduto_oltre) mt
   ON f2.regola_applicata='calcolo' AND f2.profilo IN ('puntuale','ritardo_occasionale','ritardo_abituale','ritardo_abituale_grave','insoluto_isolato')
 WHERE f.cliente_id=f2.cliente_id AND f.cliente_id=ANY(v_ids);
$old$, $new$ -- FM55 01/11: tetto informativo per tutti; ordini fuori sempre zero.
 UPDATE public.fido_teorico_cliente f SET
 ordini_fuori=0, tetto=mt.tetto, valore_senza_tetto=mt.valore
 FROM public.fido_teorico_cliente f2
 LEFT JOIN LATERAL public.fido_v2_margine_tetto(f2.base,f2.esposizione_corrente,f2.ordini_aperti,f2.acquisto_mensile,f2.scaduto_oltre) mt ON true
 WHERE f.cliente_id=f2.cliente_id AND f.cliente_id=ANY(v_ids);
$new$);
  d := replace(d, 'f.ordini_fuori,f.valore_senza_tetto,f.tetto)', 'f.ordini_fuori,f.fido_proposto,f.tetto)');
  EXECUTE d; -- solo CREATE OR REPLACE FUNCTION, non esegue il blocco
END
$migration$;

DO $migration$
DECLARE d text := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
BEGIN
  IF md5(d) <> '91dfaaaa99a24efbe47c4b94f47473dd' THEN RAISE EXCEPTION 'Definizione inattesa: aggiorna_alert_fidi'; END IF;
  d := replace(d, $old$public.arrotonda_fido_v2(GREATEST(v.fido_proposto::numeric,
             (COALESCE(v.esposizione,0) + COALESCE(v.ordini_aperti,0))::numeric / NULLIF(s1, 0)))$old$, $new$GREATEST(v.fido_proposto::numeric,
              public.arrotonda_fido_v2(COALESCE(v.esposizione,0)::numeric / NULLIF(s1, 0)))$new$);
  EXECUTE d; -- solo CREATE OR REPLACE FUNCTION, non aggiorna gli alert
END
$migration$;

REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fido_v2_margine_tetto(numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fido_v2_margine_tetto(numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;