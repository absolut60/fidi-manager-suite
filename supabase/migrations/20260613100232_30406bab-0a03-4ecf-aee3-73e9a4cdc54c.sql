
-- 1) Allarga il check di azioni_recupero.tipo
ALTER TABLE public.azioni_recupero DROP CONSTRAINT IF EXISTS azioni_recupero_tipo_check;
ALTER TABLE public.azioni_recupero ADD CONSTRAINT azioni_recupero_tipo_check
  CHECK (tipo = ANY (ARRAY['email','telefonata','promemoria','nota','lettera','promemoria_scadenza']));

-- 2) Allarga il check di template_email.tipo
ALTER TABLE public.template_email DROP CONSTRAINT IF EXISTS template_email_tipo_check;
ALTER TABLE public.template_email ADD CONSTRAINT template_email_tipo_check
  CHECK (tipo = ANY (ARRAY['sollecito_1','sollecito_2','messa_in_mora','libero','promemoria_scadenza']));

-- 3) Aggiungi tipo_campagna + mesi a campagne_sollecito
ALTER TABLE public.campagne_sollecito
  ADD COLUMN IF NOT EXISTS tipo_campagna text NOT NULL DEFAULT 'sollecito',
  ADD COLUMN IF NOT EXISTS mesi text[];

ALTER TABLE public.campagne_sollecito DROP CONSTRAINT IF EXISTS campagne_sollecito_tipo_campagna_check;
ALTER TABLE public.campagne_sollecito ADD CONSTRAINT campagne_sollecito_tipo_campagna_check
  CHECK (tipo_campagna = ANY (ARRAY['sollecito','promemoria_scadenza']));

-- 4) get_clienti_avvisati: escludi tipo='promemoria_scadenza'
CREATE OR REPLACE FUNCTION public.get_clienti_avvisati()
 RETURNS TABLE(cliente_id uuid, n_azioni integer, ha_email boolean, ultima_tipo text, ultima_data timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH aperte AS (
    SELECT s.id, s.cliente_id
    FROM public.scadenze s
    WHERE
      lower(coalesce(s.tempi_scadenza, '')) LIKE '%scader%'
      OR lower(coalesce(s.tempi_scadenza, '')) LIKE '%scadut%'
      OR (
        lower(coalesce(s.tempi_scadenza, '')) NOT LIKE '%pagat%'
        AND s.stato_contabile = 'Aperta'
      )
  ),
  azioni_linked AS (
    SELECT DISTINCT a.id, a.cliente_id, a.tipo::text AS tipo, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN aperte ap ON ap.id = ars.scadenza_id AND ap.cliente_id = a.cliente_id
    WHERE a.tipo <> 'promemoria_scadenza'
  )
  SELECT
    al.cliente_id,
    COUNT(*)::int AS n_azioni,
    bool_or(al.tipo = 'email') AS ha_email,
    (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1] AS ultima_tipo,
    MAX(al.data_azione) AS ultima_data
  FROM azioni_linked al
  GROUP BY al.cliente_id;
$function$;

-- 5) get_recupero_clienti_aggregato: escludi tipo='promemoria_scadenza' dal motore di recupero
CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _data_da timestamp with time zone DEFAULT NULL::timestamp with time zone, _data_a timestamp with time zone DEFAULT NULL::timestamp with time zone, _esiti text[] DEFAULT NULL::text[], _tipi text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, totale_scaduto numeric, azioni_totali integer, azioni_aperte integer, prossima_tipo text, prossima_data timestamp with time zone, ultima_fatta_tipo text, ultima_fatta_data timestamp with time zone, ha_promessa boolean, data_promessa timestamp with time zone, in_ritardo boolean)
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
    pc.in_ritardo
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id;
$function$;
