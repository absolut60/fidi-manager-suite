
-- 1. Campo livello_sollecito su azioni_recupero
ALTER TABLE public.azioni_recupero
  ADD COLUMN IF NOT EXISTS livello_sollecito smallint NULL
    CHECK (livello_sollecito IS NULL OR livello_sollecito BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS idx_azioni_recupero_livello
  ON public.azioni_recupero (cliente_id, livello_sollecito)
  WHERE livello_sollecito IS NOT NULL;

-- 2. Backfill best-effort dalle email gia inviate (match per prefisso oggetto)
UPDATE public.azioni_recupero
SET livello_sollecito = CASE
  WHEN email_oggetto ILIKE 'Costituzione in mora%'  THEN 3
  WHEN email_oggetto ILIKE 'Secondo sollecito%'     THEN 2
  WHEN email_oggetto ILIKE 'Sollecito di pagamento%' THEN 1
  ELSE NULL
END
WHERE tipo = 'email' AND livello_sollecito IS NULL;

-- 3. Estendo RPC aggregato: aggiungo parametro _stadi e campi stadio_*
DROP FUNCTION IF EXISTS public.get_recupero_clienti_aggregato(
  uuid, uuid, text, timestamptz, timestamptz, text[], text[]
);

CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(
  _store_id uuid DEFAULT NULL,
  _operatore_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _data_da timestamptz DEFAULT NULL,
  _data_a timestamptz DEFAULT NULL,
  _esiti text[] DEFAULT NULL,
  _tipi text[] DEFAULT NULL,
  _stadi int[] DEFAULT NULL
)
RETURNS TABLE(
  cliente_id uuid,
  ragione_sociale text,
  store_id uuid,
  store_nome text,
  totale_scaduto numeric,
  azioni_totali int,
  azioni_aperte int,
  prossima_tipo text,
  prossima_data timestamptz,
  ultima_fatta_tipo text,
  ultima_fatta_data timestamptz,
  ha_promessa boolean,
  data_promessa timestamptz,
  in_ritardo boolean,
  stadio_sollecito smallint,
  stadio_data timestamptz,
  stadio_giorni int
)
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
    WHERE (
      lower(coalesce(s.tempi_scadenza, '')) LIKE '%scadut%'
      OR (
        coalesce(s.tempi_scadenza,'') !~* 'a scadere|pagat|scadut'
        AND s.stato_contabile = 'Aperta'
        AND COALESCE(s.giorni_ritardo,0) > 0
      )
    )
    GROUP BY s.cliente_id
  ),
  per_cliente AS (
    SELECT
      az.cliente_id,
      COUNT(*)::int AS azioni_totali,
      COUNT(*) FILTER (WHERE az.esito = 'da_fare')::int AS azioni_aperte,
      bool_or(az.esito = 'promessa_pagamento') AS ha_promessa,
      MAX(az.data_promessa_pagamento) FILTER (WHERE az.esito = 'promessa_pagamento') AS data_promessa,
      bool_or(az.esito = 'da_fare' AND az.data_azione < now()) AS in_ritardo
    FROM az
    GROUP BY az.cliente_id
  ),
  prossima AS (
    SELECT DISTINCT ON (az.cliente_id)
      az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az
    WHERE az.esito = 'da_fare'
    ORDER BY az.cliente_id, az.data_azione ASC
  ),
  ultima AS (
    SELECT DISTINCT ON (az.cliente_id)
      az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az
    WHERE az.esito = 'fatto'
    ORDER BY az.cliente_id, az.data_azione DESC
  ),
  -- Solo email collegate a scadenze ANCORA APERTE (stessa logica scaduto/aperto)
  email_aperte AS (
    SELECT DISTINCT a.id, a.cliente_id, a.livello_sollecito, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN public.scadenze s ON s.id = ars.scadenza_id
    WHERE a.tipo = 'email'
      AND a.livello_sollecito IS NOT NULL
      AND a.livello_sollecito BETWEEN 1 AND 3
      AND (
        lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%'
        OR lower(coalesce(s.tempi_scadenza,'')) LIKE '%scader%'
        OR (
          lower(coalesce(s.tempi_scadenza,'')) NOT LIKE '%pagat%'
          AND s.stato_contabile = 'Aperta'
        )
      )
  ),
  stadio_cli AS (
    SELECT
      cliente_id,
      MAX(livello_sollecito)::smallint AS stadio_sollecito,
      MAX(data_azione) FILTER (
        WHERE livello_sollecito = (SELECT MAX(e2.livello_sollecito)
                                   FROM email_aperte e2
                                   WHERE e2.cliente_id = email_aperte.cliente_id)
      ) AS stadio_data
    FROM email_aperte
    GROUP BY cliente_id
  )
  SELECT
    c.id,
    c.ragione_sociale,
    c.store_id,
    st.nome,
    COALESCE(sc.totale_scaduto, 0),
    pc.azioni_totali,
    pc.azioni_aperte,
    p.tipo,
    p.data_azione,
    u.tipo,
    u.data_azione,
    pc.ha_promessa,
    pc.data_promessa,
    pc.in_ritardo,
    COALESCE(stc.stadio_sollecito, 0::smallint) AS stadio_sollecito,
    stc.stadio_data,
    CASE WHEN stc.stadio_data IS NOT NULL
         THEN EXTRACT(DAY FROM (now() - stc.stadio_data))::int
         ELSE NULL END AS stadio_giorni
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id
  LEFT JOIN stadio_cli stc ON stc.cliente_id = c.id
  WHERE (_stadi IS NULL OR COALESCE(stc.stadio_sollecito, 0::smallint)::int = ANY(_stadi));
$function$;

-- 4. RPC dedicata per il check coerenza pre-invio escalation:
-- restituisce, per ciascun cliente, le scadenze aperte attuali e le scadenze
-- collegate all'ultima azione email del livello inferiore.
CREATE OR REPLACE FUNCTION public.get_coerenza_escalation(
  _cliente_ids uuid[],
  _livello_precedente smallint
)
RETURNS TABLE(
  cliente_id uuid,
  scadenze_aperte_correnti uuid[],
  scadenze_precedente uuid[],
  ha_azione_precedente boolean,
  scaduto_cambiato boolean,
  data_azione_precedente timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH input AS (
    SELECT UNNEST(_cliente_ids) AS cliente_id
  ),
  aperte AS (
    SELECT
      i.cliente_id,
      ARRAY_AGG(s.id) FILTER (WHERE s.id IS NOT NULL) AS ids
    FROM input i
    LEFT JOIN public.scadenze s
      ON s.cliente_id = i.cliente_id
     AND (
       lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%'
       OR (
         coalesce(s.tempi_scadenza,'') !~* 'a scadere|pagat|scadut'
         AND s.stato_contabile = 'Aperta'
         AND COALESCE(s.giorni_ritardo,0) > 0
       )
     )
    GROUP BY i.cliente_id
  ),
  ultima_az_prec AS (
    SELECT DISTINCT ON (a.cliente_id)
      a.cliente_id, a.id AS azione_id, a.data_azione
    FROM public.azioni_recupero a
    WHERE a.tipo = 'email'
      AND a.livello_sollecito = _livello_precedente
      AND a.cliente_id = ANY(_cliente_ids)
    ORDER BY a.cliente_id, a.data_azione DESC
  ),
  prec AS (
    SELECT
      uap.cliente_id,
      uap.data_azione,
      ARRAY_AGG(ars.scadenza_id) FILTER (WHERE ars.scadenza_id IS NOT NULL) AS ids
    FROM ultima_az_prec uap
    LEFT JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = uap.azione_id
    GROUP BY uap.cliente_id, uap.data_azione
  )
  SELECT
    i.cliente_id,
    COALESCE(a.ids, ARRAY[]::uuid[]) AS scadenze_aperte_correnti,
    COALESCE(p.ids, ARRAY[]::uuid[]) AS scadenze_precedente,
    (p.cliente_id IS NOT NULL) AS ha_azione_precedente,
    CASE
      WHEN p.cliente_id IS NULL THEN false
      WHEN COALESCE(p.ids, ARRAY[]::uuid[]) <@ COALESCE(a.ids, ARRAY[]::uuid[]) THEN false
      ELSE true
    END AS scaduto_cambiato,
    p.data_azione
  FROM input i
  LEFT JOIN aperte a ON a.cliente_id = i.cliente_id
  LEFT JOIN prec p   ON p.cliente_id = i.cliente_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(
  uuid, uuid, text, timestamptz, timestamptz, text[], text[], int[]
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coerenza_escalation(uuid[], smallint)
  TO authenticated, service_role;
