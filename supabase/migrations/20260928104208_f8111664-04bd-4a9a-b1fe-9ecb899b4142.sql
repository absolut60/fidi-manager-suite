DROP POLICY "Store manager inserisce azioni per suoi clienti" ON public.azioni_recupero;

CREATE POLICY "Store manager e agente inseriscono azioni sui propri clienti" ON public.azioni_recupero
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clienti c
      WHERE c.id = azioni_recupero.cliente_id
        AND (
          (c.store_id IS NOT NULL AND c.store_id = (SELECT public.profilo_store_id_corrente()))
          OR (c.codice_agente IS NOT NULL AND c.codice_agente = (SELECT public.agente_codice_corrente()))
        )
    )
  );

COMMENT ON POLICY "Store manager e agente inseriscono azioni sui propri clienti" ON public.azioni_recupero
  IS 'FM36: inserimento operativo solo per il proprio negozio o i propri clienti agente. Amministratore/direzione/amministrazione passano dalla policy ALL ''Admin/Direzione/Amm gestiscono azioni''. I ruoli di sola visione globale (responsabile_agenti, approvatori senza amministrazione) NON inseriscono.';

DROP FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[]);

CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _data_da timestamp with time zone DEFAULT NULL::timestamp with time zone, _data_a timestamp with time zone DEFAULT NULL::timestamp with time zone, _esiti text[] DEFAULT NULL::text[], _tipi text[] DEFAULT NULL::text[], _stadi integer[] DEFAULT NULL::integer[], _cliente_id uuid DEFAULT NULL::uuid)
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
      AND (_cliente_id IS NULL OR a.cliente_id = _cliente_id)
  ),
  scad AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END) AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END) AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
    GROUP BY s.cliente_id
  ),
  scad_clamp AS (SELECT cliente_id, public.calcola_scaduto(ssa, ant) AS totale_scaduto FROM scad),
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
      AND (_cliente_id IS NULL OR a.cliente_id = _cliente_id)
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
  LEFT JOIN scad_clamp sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id
  LEFT JOIN stadio_cli stc ON stc.cliente_id = c.id
  WHERE (_stadi IS NULL OR COALESCE(stc.stadio_sollecito, 0::smallint)::int = ANY(_stadi));
$function$;

-- GRANT EXECUTE identici agli attuali
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[], uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[], uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[], uuid) TO postgres;