-- Allinea classificazione scadenze al gestionale: SOLO stato_contabile + data_scadenza.
-- data_pagamento_effettiva NON entra piu' nella classificazione (resta usata solo
-- nelle RPC DSO get_dso_aggregato/get_dso_serie_mensile, intoccate).

CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
 RETURNS TABLE(cliente_id uuid, totale_scaduto numeric, totale_a_scadere numeric, ha_scaduto boolean, ha_a_scadere boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT
      s.cliente_id, s.importo_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT cliente_id,
    COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria='scaduto'),0),
    COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria='a_scadere'),0),
    bool_or(categoria='scaduto'),
    bool_or(categoria='a_scadere')
  FROM cls GROUP BY cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _data_da timestamp with time zone DEFAULT NULL::timestamp with time zone, _data_a timestamp with time zone DEFAULT NULL::timestamp with time zone, _esiti text[] DEFAULT NULL::text[], _tipi text[] DEFAULT NULL::text[], _stadi integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, totale_scaduto numeric, azioni_totali integer, azioni_aperte integer, prossima_tipo text, prossima_data timestamp with time zone, ultima_fatta_tipo text, ultima_fatta_data timestamp with time zone, ha_promessa boolean, data_promessa timestamp with time zone, in_ritardo boolean, stadio_sollecito smallint, stadio_data timestamp with time zone, stadio_giorni integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH az AS (
    SELECT a.id, a.cliente_id, a.tipo, a.esito, a.data_azione, a.data_promessa_pagamento
    FROM public.azioni_recupero a
    JOIN public.clienti c ON c.id = a.cliente_id
    WHERE a.tipo <> 'promemoria_scadenza'
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_operatore_id IS NULL OR a.operatore_id = _operatore_id)
      AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
      AND (_data_da IS NULL OR a.data_azione >= _data_da)
      AND (_data_a IS NULL OR a.data_azione <= _data_a)
      AND (_esiti IS NULL OR a.esito::text = ANY(_esiti))
      AND (_tipi IS NULL OR a.tipo::text = ANY(_tipi))
  ),
  scad AS (
    SELECT s.cliente_id, SUM(s.importo_scadenza) AS totale_scaduto
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  ),
  per_cliente AS (
    SELECT az.cliente_id,
      COUNT(*)::int AS azioni_totali,
      COUNT(*) FILTER (WHERE az.esito = 'da_fare')::int AS azioni_aperte,
      bool_or(az.esito = 'promessa_pagamento') AS ha_promessa,
      MAX(az.data_promessa_pagamento) FILTER (WHERE az.esito = 'promessa_pagamento') AS data_promessa,
      bool_or(az.esito = 'da_fare' AND az.data_azione < now()) AS in_ritardo
    FROM az GROUP BY az.cliente_id
  ),
  prossima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='da_fare' ORDER BY az.cliente_id, az.data_azione ASC
  ),
  ultima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='fatto' ORDER BY az.cliente_id, az.data_azione DESC
  ),
  email_aperte AS (
    SELECT DISTINCT a.id, a.cliente_id, a.livello_sollecito, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN public.scadenze s ON s.id = ars.scadenza_id
    WHERE a.tipo='email' AND a.livello_sollecito BETWEEN 1 AND 3
      AND s.stato_contabile='Aperta'
  ),
  stadio_cli AS (
    SELECT cliente_id,
      MAX(livello_sollecito)::smallint AS stadio_sollecito,
      MAX(data_azione) FILTER (
        WHERE livello_sollecito = (SELECT MAX(e2.livello_sollecito) FROM email_aperte e2 WHERE e2.cliente_id=email_aperte.cliente_id)
      ) AS stadio_data
    FROM email_aperte GROUP BY cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome,
    COALESCE(sc.totale_scaduto,0),
    pc.azioni_totali, pc.azioni_aperte,
    p.tipo, p.data_azione, u.tipo, u.data_azione,
    pc.ha_promessa, pc.data_promessa, pc.in_ritardo,
    COALESCE(stc.stadio_sollecito, 0::smallint),
    stc.stadio_data,
    CASE WHEN stc.stadio_data IS NOT NULL THEN EXTRACT(DAY FROM (now() - stc.stadio_data))::int END
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id
  LEFT JOIN stadio_cli stc ON stc.cliente_id = c.id
  WHERE (_stadi IS NULL OR COALESCE(stc.stadio_sollecito, 0::smallint)::int = ANY(_stadi));
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_senza_email_con_scadenze()
 RETURNS TABLE(cliente_id uuid, codice_gestionale text, ragione_sociale text, email text, pec text, store_nome text, totale_scaduto numeric, totale_a_scadere numeric, n_scadenze_aperte integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
  ),
  agg AS (
    SELECT cliente_id,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto'),0) AS tot_scaduto,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'),0) AS tot_a_scadere,
      COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere'))::int AS n_aperte
    FROM cls GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere')) > 0
  )
  SELECT c.id, c.codice_gestionale, c.ragione_sociale, c.email, c.pec,
         st.nome, agg.tot_scaduto, agg.tot_a_scadere, agg.n_aperte
  FROM agg
  JOIN public.clienti c ON c.id = agg.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE (c.email IS NULL OR btrim(c.email) = '')
  ORDER BY st.nome ASC NULLS LAST, agg.tot_scaduto DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_coerenza_escalation(_cliente_ids uuid[], _livello_precedente smallint)
 RETURNS TABLE(cliente_id uuid, scadenze_aperte_correnti uuid[], scadenze_precedente uuid[], ha_azione_precedente boolean, scaduto_cambiato boolean, data_azione_precedente timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH input AS (SELECT UNNEST(_cliente_ids) AS cliente_id),
  aperte AS (
    SELECT i.cliente_id, ARRAY_AGG(s.id) FILTER (WHERE s.id IS NOT NULL) AS ids
    FROM input i
    LEFT JOIN public.scadenze s
      ON s.cliente_id = i.cliente_id
     AND s.stato_contabile = 'Aperta'
     AND s.data_scadenza IS NOT NULL
     AND s.data_scadenza < CURRENT_DATE
    GROUP BY i.cliente_id
  ),
  ultima_az_prec AS (
    SELECT DISTINCT ON (a.cliente_id) a.cliente_id, a.id AS azione_id, a.data_azione
    FROM public.azioni_recupero a
    WHERE a.tipo='email' AND a.livello_sollecito = _livello_precedente AND a.cliente_id = ANY(_cliente_ids)
    ORDER BY a.cliente_id, a.data_azione DESC
  ),
  prec AS (
    SELECT uap.cliente_id, uap.data_azione,
      ARRAY_AGG(ars.scadenza_id) FILTER (WHERE ars.scadenza_id IS NOT NULL) AS ids
    FROM ultima_az_prec uap
    LEFT JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = uap.azione_id
    GROUP BY uap.cliente_id, uap.data_azione
  )
  SELECT i.cliente_id,
    COALESCE(a.ids, ARRAY[]::uuid[]),
    COALESCE(p.ids, ARRAY[]::uuid[]),
    (p.cliente_id IS NOT NULL),
    CASE
      WHEN p.cliente_id IS NULL THEN false
      WHEN COALESCE(p.ids, ARRAY[]::uuid[]) <@ COALESCE(a.ids, ARRAY[]::uuid[]) THEN false
      ELSE true
    END,
    p.data_azione
  FROM input i
  LEFT JOIN aperte a ON a.cliente_id = i.cliente_id
  LEFT JOIN prec p ON p.cliente_id = i.cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_avvisati()
 RETURNS TABLE(cliente_id uuid, n_azioni integer, ha_email boolean, ultima_tipo text, ultima_data timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH aperte AS (
    SELECT s.id, s.cliente_id
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
  ),
  azioni_linked AS (
    SELECT DISTINCT a.id, a.cliente_id, a.tipo::text AS tipo, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN aperte ap ON ap.id = ars.scadenza_id AND ap.cliente_id = a.cliente_id
    WHERE a.tipo <> 'promemoria_scadenza'
  )
  SELECT al.cliente_id, COUNT(*)::int, bool_or(al.tipo='email'),
    (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1], MAX(al.data_azione)
  FROM azioni_linked al GROUP BY al.cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(_mesi text[], _store_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _importo_min numeric DEFAULT NULL::numeric, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, email text, pec text, bloccato boolean, n_scadenze integer, totale_a_scadere numeric, prima_scadenza date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sc AS (
    SELECT s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza >= current_date
      AND (_escludi_legale IS FALSE OR COALESCE(s.in_legale, false) = false)
      AND _mesi IS NOT NULL AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
    GROUP BY s.cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome, c.email, c.pec,
    COALESCE(c.bloccato, false), sc.n_scadenze, sc.totale, sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$function$;

CREATE OR REPLACE FUNCTION public.genera_snapshot(_data date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid;
BEGIN
  DELETE FROM public.snapshot_scaduto_cliente WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto_store WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto WHERE data_snapshot = _data;

  WITH cls AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  ),
  scadute AS (
    SELECT id, cliente_id, importo_scadenza, data_scadenza, (_data - data_scadenza)::int AS ritardo
    FROM cls WHERE categoria='scaduto' AND data_scadenza IS NOT NULL AND data_scadenza < _data
  ),
  scadute_solare AS (SELECT * FROM scadute WHERE data_scadenza >= date_trunc('year', _data)::date),
  scadute_mobile AS (SELECT * FROM scadute WHERE data_scadenza >= (_data - INTERVAL '365 days')::date),
  a_scadere AS (SELECT cliente_id, importo_scadenza FROM cls WHERE categoria='a_scadere'),
  aperte_non_pagate AS (SELECT id, cliente_id FROM cls WHERE categoria IN ('scaduto','a_scadere')),
  email_aperte AS (
    SELECT DISTINCT a.cliente_id, a.livello_sollecito
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN aperte_non_pagate ap ON ap.id = ars.scadenza_id
    WHERE a.tipo='email' AND a.livello_sollecito BETWEEN 1 AND 3
  ),
  stadio_cli AS (SELECT cliente_id, MAX(livello_sollecito)::smallint AS stadio FROM email_aperte GROUP BY cliente_id),
  clienti_scaduti AS (SELECT DISTINCT cliente_id FROM scadute)
  INSERT INTO public.snapshot_scaduto (
    data_snapshot, totale_scaduto, totale_a_scadere, n_clienti_con_scaduto, n_fatture_scadute,
    scaduto_1_30, scaduto_31_60, scaduto_oltre_60,
    ritardo_medio_tot, ritardo_mediano_tot, ritardo_ponderato_tot,
    ritardo_medio_solare, ritardo_mediano_solare, ritardo_ponderato_solare, scaduto_solare,
    ritardo_medio_mobile, ritardo_mediano_mobile, ritardo_ponderato_mobile, scaduto_mobile,
    n_clienti_stadio_0, n_clienti_stadio_1, n_clienti_stadio_2, n_clienti_stadio_mora,
    n_azioni_aperte, n_azioni_in_ritardo, n_promesse_pagamento
  )
  SELECT _data,
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM a_scadere),0),
    (SELECT COUNT(*) FROM clienti_scaduti),
    (SELECT COUNT(*) FROM scadute),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo BETWEEN 1 AND 30),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo BETWEEN 31 AND 60),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo > 60),0),
    (SELECT AVG(ritardo) FROM scadute),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute),
    (SELECT AVG(ritardo) FROM scadute_solare),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute_solare),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute_solare),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute_solare),0),
    (SELECT AVG(ritardo) FROM scadute_mobile),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute_mobile),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute_mobile),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute_mobile),0),
    (SELECT COUNT(*) FROM clienti_scaduti cs WHERE NOT EXISTS (SELECT 1 FROM stadio_cli sc WHERE sc.cliente_id=cs.cliente_id)),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio=1),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio=2),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio=3),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito='da_fare' AND tipo<>'promemoria_scadenza'),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito='da_fare' AND tipo<>'promemoria_scadenza' AND data_azione < (_data + INTERVAL '1 day')::timestamptz),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito='promessa_pagamento')
  RETURNING id INTO _id;

  INSERT INTO public.snapshot_scaduto_store (data_snapshot, store_id, totale_scaduto, totale_a_scadere, n_fatture_scadute, ritardo_medio_tot)
  WITH cls AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile='Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile='Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT _data, c.store_id,
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='scaduto'),0),
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='a_scadere'),0),
    COUNT(*) FILTER (WHERE cls.categoria='scaduto')::int,
    AVG((_data - cls.data_scadenza)::int) FILTER (WHERE cls.categoria='scaduto')
  FROM cls JOIN public.clienti c ON c.id = cls.cliente_id
  GROUP BY c.store_id
  HAVING COUNT(*) FILTER (WHERE cls.categoria IN ('scaduto','a_scadere')) > 0;

  INSERT INTO public.snapshot_scaduto_cliente (data_snapshot, cliente_id, totale_scaduto, totale_a_scadere, n_fatture_scadute, ritardo_medio_tot)
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile='Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile='Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT _data, cls.cliente_id,
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='scaduto'),0),
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='a_scadere'),0),
    COUNT(*) FILTER (WHERE cls.categoria='scaduto')::int,
    AVG((_data - cls.data_scadenza)::int) FILTER (WHERE cls.categoria='scaduto')
  FROM cls GROUP BY cls.cliente_id
  HAVING COUNT(*) FILTER (WHERE cls.categoria='scaduto') > 0;

  RETURN _id;
END;
$function$;