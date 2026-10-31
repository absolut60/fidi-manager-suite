ALTER TABLE public.fido_teorico_cliente ADD COLUMN IF NOT EXISTS pagato_12m numeric NOT NULL DEFAULT 0;

-- Cambia il tipo di ritorno (nuova colonna pagato_12m): va ricreata.
DROP FUNCTION IF EXISTS public.scaduto_oltre_giorni(uuid[]);
CREATE FUNCTION public.scaduto_oltre_giorni(_cliente_ids uuid[] DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, scaduto_oltre numeric, giorni_max integer, pagato_12m numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  -- FM55: fonte unica dello "scaduto oltre N giorni" e dell'incassato reale 12 mesi (fido teorico, alert).
  -- Scaduto: righe canoniche 'scaduto'; per le non-ANTICIPO con codice non escluso conta la riga se
  -- giorni > soglia (RiBa = codice ~* '^RB' con soglia propria); compensa tutti gli ANTICIPO scaduti.
  -- Pagato 12m: regola del cruscotto incassi, per riga non-ANTICIPO con data_pagamento_effettiva
  -- negli ultimi 365 giorni e importo_pagato > 0: LEAST(GREATEST(importo_pagato,0), importo_scadenza).
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_giorni'), ',', '.')), '')::numeric, 15) AS gg,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_giorni_riba'), ',', '.')), '')::numeric, 5) AS gg_rb,
      COALESCE((SELECT array_agg(upper(trim(x))) FROM unnest(string_to_array(
        COALESCE((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_escludi_codici'), 'BOS'), ',')) x
        WHERE trim(x) <> ''), ARRAY[]::text[]) AS escl
  ),
  r AS (
    SELECT s.cliente_id, COALESCE(s.importo_scadenza, 0) AS imp,
      public.is_anticipo(s.numero_documento) AS ant,
      (upper(trim(COALESCE(s.codice_pagamento, ''))) = ANY(cfg.escl)) AS escluso,
      COALESCE(CURRENT_DATE - s.data_scadenza, s.giorni_ritardo, 0) AS gg,
      CASE WHEN COALESCE(s.codice_pagamento, '') ~* '^RB' THEN cfg.gg_rb ELSE cfg.gg END AS soglia
    FROM public.scadenze s CROSS JOIN cfg
    WHERE (_cliente_ids IS NULL OR s.cliente_id = ANY(_cliente_ids))
      AND (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND public.categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE, s.tempi_scadenza_key, s.importo_pagato) = 'scaduto'
  ),
  sc AS (
    SELECT r.cliente_id,
      public.calcola_scaduto(
        COALESCE(sum(r.imp) FILTER (WHERE NOT r.ant AND NOT r.escluso AND r.gg > r.soglia), 0),
        COALESCE(sum(r.imp) FILTER (WHERE r.ant), 0)) AS scaduto_oltre,
      COALESCE(max(r.gg) FILTER (WHERE NOT r.ant AND NOT r.escluso AND r.gg > r.soglia), 0)::int AS giorni_max
    FROM r GROUP BY r.cliente_id
  ),
  pg AS (
    SELECT s.cliente_id, sum(LEAST(GREATEST(s.importo_pagato, 0), s.importo_scadenza)) AS pagato_12m
    FROM public.scadenze s
    WHERE (_cliente_ids IS NULL OR s.cliente_id = ANY(_cliente_ids))
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.data_pagamento_effettiva >= CURRENT_DATE - 365
      AND s.data_pagamento_effettiva <= CURRENT_DATE
      AND COALESCE(s.importo_pagato, 0) > 0
      AND COALESCE(s.importo_scadenza, 0) > 0
    GROUP BY s.cliente_id
  )
  SELECT COALESCE(sc.cliente_id, pg.cliente_id), COALESCE(sc.scaduto_oltre, 0), COALESCE(sc.giorni_max, 0), COALESCE(pg.pagato_12m, 0)
  FROM sc FULL JOIN pg ON pg.cliente_id = sc.cliente_id
$$;
REVOKE EXECUTE ON FUNCTION public.scaduto_oltre_giorni(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scaduto_oltre_giorni(uuid[]) TO authenticated, service_role;

-- Segnalazioni: nuova firma con scaduto_oltre e pagato_12m (scaduto_da_incassare).
CREATE OR REPLACE FUNCTION public.segnalazioni_fido(
  _regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric,
  _scaduto_oltre numeric, _pagato_12m numeric)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_segnalazione_ordini_quota'),',','.')),'')::numeric, 0.5) AS quota,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_ordini,0) ord, COALESCE(_fido_gamma,0) fg,
           COALESCE(_scaduto_oltre,0) so FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN _regola IS DISTINCT FROM 'scaduto_non_incassato' AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.b>0 AND v.fab>v.b THEN 'impegni_sopra_base' END,
    CASE WHEN v.ord>0 AND v.ord > cfg.quota*v.fab THEN 'ordini_prevalenti' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL)
  FROM v, cfg
$f$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;

DO $do$
DECLARE d text;
BEGIN
  -- ===== blocco: pubblica pagato_12m e usa la nuova firma delle segnalazioni =====
  d := pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure);
  IF (length(d) - length(replace(d, $t$scaduto_oltre_giorni=COALESCE(s.giorni_max,0)$t$, ''))) / length($t$scaduto_oltre_giorni=COALESCE(s.giorni_max,0)$t$) <> 1 THEN RAISE EXCEPTION 'blocco: scaduto'; END IF;
  d := replace(d, $t$scaduto_oltre_giorni=COALESCE(s.giorni_max,0)$t$, $t$scaduto_oltre_giorni=COALESCE(s.giorni_max,0), pagato_12m=GREATEST(COALESCE(s.pagato_12m,0),0)$t$);
  IF (length(d) - length(replace(d, $t$f.ordini_aperti,f.fido_attuale)$t$, ''))) / length($t$f.ordini_aperti,f.fido_attuale)$t$) <> 1 THEN RAISE EXCEPTION 'blocco: segnalazioni'; END IF;
  d := replace(d, $t$f.ordini_aperti,f.fido_attuale)$t$, $t$f.ordini_aperti,f.fido_attuale,f.scaduto_oltre,f.pagato_12m)$t$);
  EXECUTE d;

  -- ===== get_fido_teorico_v2: regola con quota sul pagato 12 mesi =====
  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  IF position('sc_pag12' in d) > 0 THEN RAISE EXCEPTION 'v2: già aggiornata'; END IF;
  IF (length(d) - length(replace(d, $t$::int AS sc_gg_riba,$t$, ''))) / length($t$::int AS sc_gg_riba,$t$) <> 1 THEN RAISE EXCEPTION 'v2: riba'; END IF;
  d := replace(d, $t$::int AS sc_gg_riba,$t$, $t$::int AS sc_gg_riba,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_quota_pagato'), ',', '.')), '')::numeric, 0.10) AS sc_quota,$t$);
  IF (length(d) - length(replace(d, $t$COALESCE(so.giorni_max, 0) AS sc_gmax,$t$, ''))) / length($t$COALESCE(so.giorni_max, 0) AS sc_gmax,$t$) <> 1 THEN RAISE EXCEPTION 'v2: gmax'; END IF;
  d := replace(d, $t$COALESCE(so.giorni_max, 0) AS sc_gmax,$t$, $t$COALESCE(so.giorni_max, 0) AS sc_gmax, COALESCE(so.pagato_12m, 0) AS sc_pag12,$t$);
  IF (length(d) - length(replace(d, $t$WHEN b.sc_oltre > b.sc_imp THEN 'scaduto_non_incassato'$t$, ''))) / length($t$WHEN b.sc_oltre > b.sc_imp THEN 'scaduto_non_incassato'$t$) <> 1 THEN RAISE EXCEPTION 'v2: regola'; END IF;
  d := replace(d, $t$WHEN b.sc_oltre > b.sc_imp THEN 'scaduto_non_incassato'$t$,
    $t$WHEN b.sc_oltre > b.sc_imp AND (b.sc_pag12 <= 0 OR b.sc_oltre > b.sc_quota * b.sc_pag12) THEN 'scaduto_non_incassato'$t$);
  IF (length(d) - length(replace(d, $t$ giorni). Fido a zero finché non rientra.'$t$, ''))) / length($t$ giorni). Fido a zero finché non rientra.'$t$) <> 1 THEN RAISE EXCEPTION 'v2: testo'; END IF;
  d := replace(d, $t$ giorni). Fido a zero finché non rientra.'$t$,
    $t$ giorni), '
           || CASE WHEN r.sc_pag12 > 0 THEN 'pari al ' || round(r.sc_oltre / r.sc_pag12 * 100)::int || '% di quanto pagato in 12 mesi'
                   ELSE 'nessun pagamento negli ultimi 12 mesi' END
           || '. Fido a zero finché non rientra.'$t$);
  EXECUTE d;
END
$do$;

-- La vecchia firma a 5 argomenti non è più usata: sostituita da quella con scaduto e pagato.
DROP FUNCTION IF EXISTS public.segnalazioni_fido(text,numeric,numeric,numeric,numeric);