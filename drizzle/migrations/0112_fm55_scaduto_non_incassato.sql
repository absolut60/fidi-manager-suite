-- FM55 fetta 1: regola "scaduto non incassato" nel fido teorico.

ALTER TABLE public.fido_teorico_cliente
  ADD COLUMN IF NOT EXISTS scaduto_oltre numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scaduto_oltre_giorni integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.scaduto_oltre_giorni(_cliente_ids uuid[] DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, scaduto_oltre numeric, giorni_max integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  -- FM55: fonte unica dello "scaduto oltre N giorni" (fido teorico, alert).
  -- Righe canoniche 'scaduto'; per le non-ANTICIPO con codice non escluso conta la riga se
  -- giorni > soglia (RiBa = codice ~* '^RB' con soglia propria); compensa tutti gli ANTICIPO scaduti.
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
  )
  SELECT r.cliente_id,
    public.calcola_scaduto(
      COALESCE(sum(r.imp) FILTER (WHERE NOT r.ant AND NOT r.escluso AND r.gg > r.soglia), 0),
      COALESCE(sum(r.imp) FILTER (WHERE r.ant), 0)),
    COALESCE(max(r.gg) FILTER (WHERE NOT r.ant AND NOT r.escluso AND r.gg > r.soglia), 0)::int
  FROM r
  GROUP BY r.cliente_id
$$;
REVOKE EXECUTE ON FUNCTION public.scaduto_oltre_giorni(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scaduto_oltre_giorni(uuid[]) TO authenticated, service_role;

DO $do$
DECLARE d text;
  PROCEDURE_DUMMY int;
BEGIN
  -- ===== get_fido_teorico_v2 =====
  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  IF position('scaduto_non_incassato' in d) > 0 THEN RAISE EXCEPTION 'get_fido_teorico_v2: già aggiornata'; END IF;

  IF (length(d) - length(replace(d, $t$AS c_fermo,$t$, ''))) / length($t$AS c_fermo,$t$) <> 1 THEN RAISE EXCEPTION 'v2: c_fermo'; END IF;
  d := replace(d, $t$AS c_fermo,$t$, $t$AS c_fermo,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_importo'), ',', '.')), '')::numeric, 500) AS sc_imp,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_giorni'), ',', '.')), '')::numeric, 15)::int AS sc_gg_cfg,$t$);

  IF (length(d) - length(replace(d, $t$COALESCE(sc.scaduto, 0) AS scaduto,$t$, ''))) / length($t$COALESCE(sc.scaduto, 0) AS scaduto,$t$) <> 1 THEN RAISE EXCEPTION 'v2: scaduto col'; END IF;
  d := replace(d, $t$COALESCE(sc.scaduto, 0) AS scaduto,$t$, $t$COALESCE(sc.scaduto, 0) AS scaduto,
      COALESCE(so.scaduto_oltre, 0) AS sc_oltre, COALESCE(so.giorni_max, 0) AS sc_gmax,$t$);

  IF (length(d) - length(replace(d, $t$LEFT JOIN scad sc ON sc.cliente_id = c.id$t$, ''))) / length($t$LEFT JOIN scad sc ON sc.cliente_id = c.id$t$) <> 1 THEN RAISE EXCEPTION 'v2: join scad'; END IF;
  d := replace(d, $t$LEFT JOIN scad sc ON sc.cliente_id = c.id$t$, $t$LEFT JOIN scad sc ON sc.cliente_id = c.id
    LEFT JOIN public.scaduto_oltre_giorni(_cliente_ids) so ON so.cliente_id = c.id$t$);

  IF (length(d) - length(replace(d, $t$WHEN b.legale THEN 'gestione_legale'$t$, ''))) / length($t$WHEN b.legale THEN 'gestione_legale'$t$) <> 1 THEN RAISE EXCEPTION 'v2: legale'; END IF;
  d := replace(d, $t$WHEN b.legale THEN 'gestione_legale'$t$, $t$WHEN b.legale THEN 'gestione_legale'
        WHEN b.sc_oltre > b.sc_imp THEN 'scaduto_non_incassato'$t$);

  IF (length(d) - length(replace(d, $t$OR r.prof = 'nuovo_in_attesa'),$t$, ''))) / length($t$OR r.prof = 'nuovo_in_attesa'),$t$) <> 1 THEN RAISE EXCEPTION 'v2: da_verificare'; END IF;
  d := replace(d, $t$OR r.prof = 'nuovo_in_attesa'),$t$, $t$OR r.prof = 'nuovo_in_attesa' OR r.reg = 'scaduto_non_incassato'),$t$);

  IF (length(d) - length(replace(d, $t$WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'$t$, ''))) / length($t$WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'$t$) <> 1 THEN RAISE EXCEPTION 'v2: spiegazione'; END IF;
  d := replace(d, $t$WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'$t$, $t$WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'
      WHEN 'scaduto_non_incassato' THEN 'Cliente con scaduto non incassato: '
           || translate(rtrim(to_char(r.sc_oltre, 'FM999,999,990.99'), '.'), ',.', '.,')
           || ' € scaduti da oltre ' || r.sc_gg_cfg || ' giorni (fino a ' || r.sc_gmax || ' giorni). Fido a zero finché non rientra.'
           || COALESCE(' ' || NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol), '') || '.', '')$t$);
  EXECUTE d;

  -- ===== ricalcola_fido_teorico_blocco: pubblica scaduto_oltre =====
  d := pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure);
  IF (length(d) - length(replace(d, $t$AND f.cliente_id=ANY(v_ids);$t$, ''))) / length($t$AND f.cliente_id=ANY(v_ids);$t$) <> 1 THEN RAISE EXCEPTION 'blocco: frammento'; END IF;
  d := replace(d, $t$AND f.cliente_id=ANY(v_ids);$t$, $t$AND f.cliente_id=ANY(v_ids);
 -- FM55: scaduto oltre N giorni (fonte unica scaduto_oltre_giorni), 0 se nessuno.
 UPDATE public.fido_teorico_cliente f SET
 scaduto_oltre=GREATEST(COALESCE(s.scaduto_oltre,0),0), scaduto_oltre_giorni=COALESCE(s.giorni_max,0)
 FROM unnest(v_ids) u(id) LEFT JOIN public.scaduto_oltre_giorni(v_ids) s ON s.cliente_id=u.id
 WHERE f.cliente_id=u.id;$t$);
  EXECUTE d;

  -- ===== aggiorna_alert_fidi: consumo anche per scaduto_non_incassato =====
  d := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
  IF (length(d) - length(replace(d, $t$  SELECT v.cliente_id,
         COALESCE(c.fido_gestionale, 0)::numeric AS fido_gamma,$t$, ''))) / length($t$  SELECT v.cliente_id,
         COALESCE(c.fido_gestionale, 0)::numeric AS fido_gamma,$t$) <> 1 THEN RAISE EXCEPTION 'alert: select'; END IF;
  d := replace(d, $t$  SELECT v.cliente_id,
         COALESCE(c.fido_gestionale, 0)::numeric AS fido_gamma,$t$, $t$  SELECT v.cliente_id, v.regola,
         COALESCE(c.fido_gestionale, 0)::numeric AS fido_gamma,$t$);

  IF (length(d) - length(replace(d, $t$WHERE v.regola = 'calcolo';$t$, ''))) / length($t$WHERE v.regola = 'calcolo';$t$) <> 1 THEN RAISE EXCEPTION 'alert: perimetro'; END IF;
  d := replace(d, $t$WHERE v.regola = 'calcolo';$t$, $t$WHERE v.regola IN ('calcolo', 'scaduto_non_incassato');$t$);

  IF (length(d) - length(replace(d, $t$NOT EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id);$t$, ''))) / length($t$NOT EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id);$t$) <> 1 THEN RAISE EXCEPTION 'alert: fuori_calcolo'; END IF;
  d := replace(d, $t$NOT EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id);$t$,
    $t$NOT EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id AND (d.regola = 'calcolo' OR a.tipo = 'consumo'));$t$);

  IF (length(d) - length(replace(d, $t$  FROM _af_dati d;$t$, ''))) / length($t$  FROM _af_dati d;$t$) <> 1 THEN RAISE EXCEPTION 'alert: rid'; END IF;
  d := replace(d, $t$  FROM _af_dati d;$t$, $t$  FROM _af_dati d WHERE d.regola = 'calcolo';$t$);

  IF (length(d) - length(replace(d, $t$  WHERE NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'extra_non_usato' AND a.stato <> 'chiuso')$t$, ''))) / length($t$  WHERE NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'extra_non_usato' AND a.stato <> 'chiuso')$t$) <> 1 THEN RAISE EXCEPTION 'alert: extra'; END IF;
  d := replace(d, $t$  WHERE NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'extra_non_usato' AND a.stato <> 'chiuso')$t$,
    $t$  WHERE d.regola = 'calcolo'
    AND NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'extra_non_usato' AND a.stato <> 'chiuso')$t$);
  EXECUTE d;
END
$do$;