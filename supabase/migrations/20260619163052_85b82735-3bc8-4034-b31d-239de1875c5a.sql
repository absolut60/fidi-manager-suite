-- =========================================================
-- 1) get_clienti_scadenziario: nuova classificazione
-- =========================================================
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
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= CURRENT_DATE THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
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

-- =========================================================
-- 2) genera_snapshot: nuova classificazione nei 3 blocchi CTE
-- =========================================================
CREATE OR REPLACE FUNCTION public.genera_snapshot(_data date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid;
BEGIN
  DELETE FROM public.snapshot_scaduto_cliente WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto_store   WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto         WHERE data_snapshot = _data;

  WITH cls AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= _data THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
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
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= _data THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
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
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= _data THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < _data THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
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

-- =========================================================
-- 3) get_promemoria_clienti_aggregato: a_scadere = futura + non incassata
--    (prima filtrava su stato_contabile='Aperta', perdeva le R.B. Chiuse)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(
  _mesi text[],
  _store_id uuid DEFAULT NULL::uuid,
  _search text DEFAULT NULL::text,
  _importo_min numeric DEFAULT NULL::numeric,
  _escludi_legale boolean DEFAULT true,
  _escludi_bloccati boolean DEFAULT false
)
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
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza IS NOT NULL
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