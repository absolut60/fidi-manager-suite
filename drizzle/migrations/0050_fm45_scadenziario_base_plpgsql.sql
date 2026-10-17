-- FM45 Fetta 2a (prestazioni): scadenziario_clienti_base in plpgsql come la
-- get_scadenziario_totali originale (piani con parametri costanti: evita la
-- scansione di tutti i clienti). Logica invariata.
CREATE OR REPLACE FUNCTION public.scadenziario_clienti_base(
  p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false, p_agente text DEFAULT NULL::text,
  p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0,
  p_netto_coperture boolean DEFAULT false)
RETURNS TABLE(cliente_id uuid, store_id uuid, codice_agente text, bloccato boolean, in_gestione_legale boolean,
  tot_s_lordo numeric, tot_a_lordo numeric, coperto_piani numeric, coperto_promesse numeric,
  tot_s numeric, tot_a numeric, n_scadute integer, n_a_scadere integer, max_gg integer, fascia text,
  avvisato_n integer, n_promesse_data_passata integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  -- FONTE UNICA del calcolo scadenziario per cliente (copiata fedelmente da
  -- get_scadenziario_totali pre-FM45). Regole di copertura:
  --  * tot_s_lordo = calcola_scaduto(ssa, ant) sulle righe 'scaduto' (come oggi);
  --  * tot_s_senza_piani = calcola_scaduto ricalcolato ESCLUDENDO le righe
  --    scadute coperte da piano (origine='piano' in coperture_scadenziario());
  --  * coperto_piani = GREATEST(tot_s_lordo - tot_s_senza_piani, 0);
  --  * coperto_promesse = LEAST(importo promesse attive del cliente
  --    (promesse_attive_importo_cliente), GREATEST(tot_s_senza_piani, 0));
  --  * tot_s = se p_netto_coperture AND tot_s_lordo > 0:
  --    GREATEST(tot_s_lordo - coperto_piani - coperto_promesse, 0); altrimenti tot_s_lordo;
  --  * tot_a = se p_netto_coperture: a scadere senza le righe coperte da piano; altrimenti come oggi;
  --  * con p_netto_coperture n_scadute, n_a_scadere, max_gg e fascia si calcolano
  --    sulle sole righe NON coperte da piano; con p_situazione='con_scaduto'
  --    un cliente coperto per intero (lordo > 0, effettivo = 0) non compare;
  --  * coperto_piani / coperto_promesse sono SEMPRE calcolati (i "di cui");
  --  * importo minimo, fascia, situazione si applicano ai valori effettivi.
  WITH cop AS (
    SELECT c.scadenza_id FROM public.coperture_scadenziario() c WHERE c.origine = 'piano'
  ),
  cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.giorni_ritardo,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
      public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE) AS cat,
      (cop.scadenza_id IS NOT NULL) AS cop_piano
    FROM public.scadenze s
    LEFT JOIN cop ON cop.scadenza_id = s.id
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND (NOT p_escludi_bonifici OR upper(COALESCE(s.codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT c.cliente_id,
      COUNT(*) FILTER (WHERE cat='scaduto')::int AS n_s_l,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0) AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0) AS ant,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int AS n_a_l,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric AS tot_a_l,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto'), 0)::int AS max_gg_l,
      COUNT(*) FILTER (WHERE cat='scaduto' AND NOT cop_piano)::int AS n_s_np,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo AND NOT cop_piano), 0) AS ssa_np,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo AND NOT cop_piano), 0) AS ant_np,
      COUNT(*) FILTER (WHERE cat='a_scadere' AND NOT cop_piano)::int AS n_a_np,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere' AND NOT cop_piano), 0)::numeric AS tot_a_np,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto' AND NOT cop_piano), 0)::int AS max_gg_np
    FROM cls c
    WHERE c.cat <> 'pagato'
    GROUP BY c.cliente_id
    HAVING (COUNT(*) FILTER (WHERE cat='scaduto') > 0)
        OR (COALESCE(p_situazione,'con_scaduto') <> 'con_scaduto' AND COUNT(*) FILTER (WHERE cat='a_scadere') > 0)
  ),
  prom AS (
    SELECT * FROM public.promesse_attive_importo_cliente()
  ),
  agg2 AS (
    SELECT a.*, public.calcola_scaduto(a.ssa, a.ant) AS s_lordo,
      public.calcola_scaduto(a.ssa_np, a.ant_np) AS s_np,
      COALESCE(pr.importo_promesse, 0) AS imp_prom,
      COALESCE(pr.n_promesse_data_passata, 0) AS n_pdp
    FROM agg a LEFT JOIN prom pr ON pr.cliente_id = a.cliente_id
  ),
  agg3 AS (
    SELECT x.*,
      GREATEST(x.s_lordo - x.s_np, 0) AS cp,
      LEAST(x.imp_prom, GREATEST(x.s_np, 0)) AS cpr
    FROM agg2 x
  ),
  avv AS (
    SELECT al.cliente_id, COUNT(*)::int AS n_az
    FROM (
      SELECT DISTINCT a.id, a.cliente_id
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id AND s2.stato_contabile = 'Aperta' AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al GROUP BY al.cliente_id
  ),
  joined AS (
    SELECT cl.id, cl.store_id, cl.codice_agente,
      COALESCE(cl.bloccato,false) AS bloccato,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      COALESCE(a.s_lordo, 0) AS tot_s_lordo,
      COALESCE(a.tot_a_l, 0) AS tot_a_lordo,
      COALESCE(a.cp, 0) AS coperto_piani,
      COALESCE(a.cpr, 0) AS coperto_promesse,
      CASE WHEN p_netto_coperture AND COALESCE(a.s_lordo, 0) > 0
           THEN GREATEST(a.s_lordo - a.cp - a.cpr, 0)
           ELSE COALESCE(a.s_lordo, 0) END AS tot_s,
      CASE WHEN p_netto_coperture THEN COALESCE(a.tot_a_np, 0) ELSE COALESCE(a.tot_a_l, 0) END AS tot_a,
      CASE WHEN p_netto_coperture THEN COALESCE(a.n_s_np, 0) ELSE COALESCE(a.n_s_l, 0) END AS n_scadute,
      CASE WHEN p_netto_coperture THEN COALESCE(a.n_a_np, 0) ELSE COALESCE(a.n_a_l, 0) END AS n_a_scadere,
      CASE WHEN p_netto_coperture THEN COALESCE(a.max_gg_np, 0) ELSE COALESCE(a.max_gg_l, 0) END AS max_gg,
      COALESCE(av.n_az, 0) AS avvisato_n,
      COALESCE(a.n_pdp, 0) AS n_promesse_data_passata
    FROM public.clienti cl
    LEFT JOIN agg3 a ON a.cliente_id = cl.id
    LEFT JOIN avv av ON av.cliente_id = cl.id
    WHERE (a.cliente_id IS NOT NULL OR p_situazione = 'portafoglio')
      AND public.user_can_access_cliente(cl.id, cl.store_id, cl.codice_agente)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  ),
  j2 AS (
    SELECT j.*,
      CASE WHEN j.max_gg <= 0 THEN NULL WHEN j.max_gg <= 30 THEN '0_30' WHEN j.max_gg <= 60 THEN '31_60' ELSE 'oltre_60' END AS fascia
    FROM joined j
  )
  SELECT j.id, j.store_id, j.codice_agente, j.bloccato, j.in_gestione_legale,
    j.tot_s_lordo, j.tot_a_lordo, j.coperto_piani, j.coperto_promesse,
    j.tot_s, j.tot_a, j.n_scadute, j.n_a_scadere, j.max_gg, j.fascia, j.avvisato_n, j.n_promesse_data_passata
  FROM j2 j
  WHERE (CASE WHEN j.tot_s >= 0 THEN j.tot_s >= COALESCE(p_importo_min,0)
              WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
              ELSE false END)
    AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
    AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
    AND (COALESCE(p_situazione,'con_scaduto') IN ('con_scaduto','tutte','portafoglio')
         OR (p_situazione = 'solo_a_scadere' AND j.n_scadute = 0 AND j.n_a_scadere > 0)
         OR (p_situazione = 'scaduto_e_a_scadere' AND j.n_scadute > 0 AND j.n_a_scadere > 0))
    AND (COALESCE(p_importo_min_a_scadere,0) <= 0 OR j.tot_a >= p_importo_min_a_scadere)
    AND NOT (p_netto_coperture AND COALESCE(p_situazione,'con_scaduto') = 'con_scaduto'
             AND j.tot_s_lordo > 0 AND j.tot_s <= 0);
END;
$function$;