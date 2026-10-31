CREATE OR REPLACE FUNCTION public.aggiorna_alert_fidi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s1 numeric; s2 numeric; rid_quota numeric; rid_gg int; extra_gg int;
  v_now timestamptz := now();
  v_t0 timestamptz := clock_timestamp();
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  SELECT
    COALESCE(MAX(CASE WHEN chiave='alert_fidi_soglia_1' THEN NULLIF(trim(valore),'')::numeric END), 0.80),
    COALESCE(MAX(CASE WHEN chiave='alert_fidi_soglia_2' THEN NULLIF(trim(valore),'')::numeric END), 0.90),
    COALESCE(MAX(CASE WHEN chiave='alert_fidi_riduzione_quota' THEN NULLIF(trim(valore),'')::numeric END), 0.20),
    COALESCE(MAX(CASE WHEN chiave='alert_fidi_riduzione_giorni' THEN NULLIF(trim(valore),'')::numeric END), 30)::int,
    COALESCE(MAX(CASE WHEN chiave='alert_fidi_extra_giorni' THEN NULLIF(trim(valore),'')::numeric END), 30)::int
  INTO s1, s2, rid_quota, rid_gg, extra_gg
  FROM public.configurazioni
  WHERE chiave IN ('alert_fidi_soglia_1','alert_fidi_soglia_2','alert_fidi_riduzione_quota','alert_fidi_riduzione_giorni','alert_fidi_extra_giorni');

  -- Dati correnti dei clienti nel perimetro (riga v2 con regola = 'calcolo').
  DROP TABLE IF EXISTS _af_dati; DROP TABLE IF EXISTS _af_rid;
  CREATE TEMP TABLE _af_dati  AS
  SELECT v.cliente_id,
         COALESCE(c.fido_gestionale, 0)::numeric AS fido_gamma,
         COALESCE(v.esposizione, 0)::numeric AS esposizione,
         COALESCE(v.ordini_aperti, 0)::numeric AS ordini,
         CASE WHEN COALESCE(c.fido_gestionale, 0) > 0
              THEN (COALESCE(v.esposizione,0) + COALESCE(v.ordini_aperti,0)) / c.fido_gestionale END AS consumo,
         v.fido_proposto::numeric AS fido_proposto
  FROM public.fido_teorico_v2 v
  JOIN public.clienti c ON c.id = v.cliente_id
  WHERE v.regola = 'calcolo';
  CREATE INDEX ON _af_dati (cliente_id);

  -- e) campi correnti su tutti gli alert non chiusi
  UPDATE public.alert_fidi a SET
    fido_gamma = d.fido_gamma, esposizione = d.esposizione, ordini_aperti = d.ordini,
    consumo = d.consumo, fido_proposto = d.fido_proposto, aggiornato_il = v_now
  FROM _af_dati d
  WHERE a.cliente_id = d.cliente_id AND a.stato <> 'chiuso';

  -- Clienti usciti dal perimetro del calcolo
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, motivo_chiusura = 'fuori_calcolo', aggiornato_il = v_now
  WHERE a.stato <> 'chiuso' AND NOT EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id);

  -- d) richiesta collegata decisa (approvata/rifiutata) o annullata → chiuso
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now,
    motivo_chiusura = CASE WHEN r.stato::text = 'annullata' THEN 'richiesta_annullata' ELSE 'richiesta_decisa' END,
    aggiornato_il = v_now
  FROM public.richieste_fido r
  WHERE a.stato = 'richiesta_inserita' AND r.id = a.richiesta_id
    AND r.stato::text IN ('approvata','rifiutata','annullata');

  -- ===================== a) CONSUMO =====================
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, aggiornato_il = v_now,
    motivo_chiusura = CASE WHEN d.fido_gamma IS DISTINCT FROM a.fido_gamma_apertura THEN 'fido_cambiato' ELSE 'rientrato' END
  FROM _af_dati d
  WHERE a.tipo = 'consumo' AND a.stato IN ('aperto','in_osservazione') AND d.cliente_id = a.cliente_id
    AND (d.fido_gamma IS DISTINCT FROM a.fido_gamma_apertura OR d.fido_gamma <= 0 OR d.consumo < s1);

  UPDATE public.alert_fidi a SET livello = s2
  FROM _af_dati d
  WHERE a.tipo = 'consumo' AND a.stato <> 'chiuso' AND d.cliente_id = a.cliente_id
    AND d.consumo >= s2 AND COALESCE(a.livello, 0) < s2;

  INSERT INTO public.alert_fidi (cliente_id, tipo, livello, stato, aperto_il, aggiornato_il, fido_gamma_apertura,
    fido_gamma, esposizione, ordini_aperti, consumo, fido_proposto)
  SELECT d.cliente_id, 'consumo', CASE WHEN d.consumo >= s2 THEN s2 ELSE s1 END, 'aperto', v_now, v_now, d.fido_gamma,
         d.fido_gamma, d.esposizione, d.ordini, d.consumo, d.fido_proposto
  FROM _af_dati d
  WHERE d.fido_gamma > 0 AND d.consumo >= s1
    AND NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'consumo' AND a.stato <> 'chiuso');

  -- ===================== b) RIDUZIONE =====================
  CREATE TEMP TABLE _af_rid  AS
  SELECT d.cliente_id,
         (d.fido_proposto IS NOT NULL AND d.fido_gamma > d.fido_proposto * (1 + rid_quota)
          AND NOT EXISTS (
            SELECT 1 FROM public.richieste_fido r
            WHERE r.cliente_id = d.cliente_id AND r.stato::text = 'approvata'
              AND r.esito_fido IS DISTINCT FROM 'rifiutata'
              AND r.fido_teorico_riferimento IS NOT NULL AND r.importo_approvato > r.fido_teorico_riferimento
              AND COALESCE(r.data_approvazione, r.data_chiusura) >= v_now - make_interval(days => extra_gg))) AS cond,
         d.fido_gamma
  FROM _af_dati d;

  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, aggiornato_il = v_now,
    motivo_chiusura = CASE WHEN x.fido_gamma IS DISTINCT FROM a.fido_gamma_apertura THEN 'fido_cambiato' ELSE 'rientrato' END
  FROM _af_rid x
  WHERE a.tipo = 'riduzione' AND a.stato IN ('aperto','in_osservazione') AND x.cliente_id = a.cliente_id
    AND (x.fido_gamma IS DISTINCT FROM a.fido_gamma_apertura OR NOT x.cond);

  UPDATE public.alert_fidi a SET stato = 'aperto'
  WHERE a.tipo = 'riduzione' AND a.stato = 'in_osservazione'
    AND a.aperto_il <= v_now - make_interval(days => rid_gg);

  INSERT INTO public.alert_fidi (cliente_id, tipo, stato, aperto_il, aggiornato_il, fido_gamma_apertura,
    fido_gamma, esposizione, ordini_aperti, consumo, fido_proposto)
  SELECT d.cliente_id, 'riduzione', 'in_osservazione', v_now, v_now, d.fido_gamma,
         d.fido_gamma, d.esposizione, d.ordini, d.consumo, d.fido_proposto
  FROM _af_rid x JOIN _af_dati d USING (cliente_id)
  WHERE x.cond
    AND NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'riduzione' AND a.stato <> 'chiuso');

  -- ===================== c) EXTRA NON USATO =====================
  -- confermato → torna in osservazione all'arrivo di riproponi_dal, utilizzo ripartito da zero
  UPDATE public.alert_fidi a SET stato = 'in_osservazione', utilizzo_massimo = 0
  WHERE a.tipo = 'extra_non_usato' AND a.stato = 'confermato'
    AND a.riproponi_dal IS NOT NULL AND a.riproponi_dal <= v_now::date;

  -- nuovo alert per l'ultima richiesta approvata con extra (una sola volta per richiesta)
  INSERT INTO public.alert_fidi (cliente_id, tipo, stato, aperto_il, aggiornato_il, richiesta_id, utilizzo_massimo,
    fido_gamma_apertura, fido_gamma, esposizione, ordini_aperti, consumo, fido_proposto)
  SELECT d.cliente_id, 'extra_non_usato', 'in_osservazione', v_now, v_now, u.id, 0,
         d.fido_gamma, d.fido_gamma, d.esposizione, d.ordini, d.consumo, d.fido_proposto
  FROM _af_dati d
  JOIN LATERAL (
    SELECT r.id, r.importo_approvato, r.fido_teorico_riferimento
    FROM public.richieste_fido r
    WHERE r.cliente_id = d.cliente_id AND r.stato::text = 'approvata'
      AND r.esito_fido IS DISTINCT FROM 'rifiutata' AND r.importo_approvato IS NOT NULL
    ORDER BY COALESCE(r.data_approvazione, r.data_chiusura, r.created_at) DESC
    LIMIT 1
  ) u ON u.fido_teorico_riferimento IS NOT NULL AND u.importo_approvato > u.fido_teorico_riferimento
  WHERE NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.cliente_id = d.cliente_id AND a.tipo = 'extra_non_usato' AND a.stato <> 'chiuso')
    AND NOT EXISTS (SELECT 1 FROM public.alert_fidi a WHERE a.tipo = 'extra_non_usato' AND a.richiesta_id = u.id);

  -- utilizzo massimo, chiusure e apertura
  UPDATE public.alert_fidi a SET utilizzo_massimo = GREATEST(COALESCE(a.utilizzo_massimo, 0), d.esposizione + d.ordini)
  FROM _af_dati d
  WHERE a.tipo = 'extra_non_usato' AND a.stato = 'in_osservazione' AND d.cliente_id = a.cliente_id;

  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, aggiornato_il = v_now,
    motivo_chiusura = CASE WHEN a.utilizzo_massimo > r.fido_teorico_riferimento THEN 'extra_usato' ELSE 'assorbito' END
  FROM public.richieste_fido r, _af_dati d
  WHERE a.tipo = 'extra_non_usato' AND a.stato IN ('in_osservazione','aperto','confermato')
    AND r.id = a.richiesta_id AND d.cliente_id = a.cliente_id
    AND (a.utilizzo_massimo > r.fido_teorico_riferimento OR d.fido_proposto >= r.importo_approvato);

  UPDATE public.alert_fidi a SET stato = 'aperto'
  FROM public.richieste_fido r
  WHERE a.tipo = 'extra_non_usato' AND a.stato = 'in_osservazione' AND r.id = a.richiesta_id
    AND v_now >= COALESCE(a.riproponi_dal::timestamptz, COALESCE(r.data_approvazione, r.data_chiusura, r.created_at))
                 + make_interval(days => extra_gg);

  -- ===================== d) richiesta attiva inserita dopo l'apertura =====================
  UPDATE public.alert_fidi a SET stato = 'richiesta_inserita', richiesta_id = (
    SELECT r.id FROM public.richieste_fido r
    WHERE r.cliente_id = a.cliente_id AND r.created_at > a.aperto_il
      AND public.richiesta_fido_attiva(r.stato::text, r.stato_export)
    ORDER BY r.created_at DESC LIMIT 1)
  WHERE a.stato IN ('in_osservazione','aperto','confermato')
    AND EXISTS (SELECT 1 FROM public.richieste_fido r
      WHERE r.cliente_id = a.cliente_id AND r.created_at > a.aperto_il
        AND public.richiesta_fido_attiva(r.stato::text, r.stato_export));

  -- una richiesta approvata non ancora processata appena collegata è già decisa
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, motivo_chiusura = 'richiesta_decisa', aggiornato_il = v_now
  FROM public.richieste_fido r
  WHERE a.stato = 'richiesta_inserita' AND r.id = a.richiesta_id AND r.stato::text IN ('approvata','rifiutata');

  DROP TABLE IF EXISTS _af_dati; DROP TABLE IF EXISTS _af_rid;
  RETURN jsonb_build_object(
    'eseguito_il', v_now,
    'durata_ms', round(extract(epoch FROM clock_timestamp() - v_t0) * 1000),
    'non_chiusi', (SELECT count(*) FROM public.alert_fidi WHERE stato <> 'chiuso'));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;