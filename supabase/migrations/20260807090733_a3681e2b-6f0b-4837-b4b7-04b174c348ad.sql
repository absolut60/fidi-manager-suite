INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('fido_teorico_soglia_verifica_eur', '5000', 'Differenza minima in euro fra fido attuale e proposto perché la variazione venga segnalata come da verificare')
ON CONFLICT (chiave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_fido_teorico(_cliente_ids uuid[] DEFAULT NULL::uuid[], _solo_condizione_mancante boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, fatturato_rolling numeric, ritmo_mensile numeric, giorni integer, giorni_mancanti boolean, fido_base numeric, fido_base_lordo numeric, giorni_oltre_accordo integer, profilo_pagamento text, coefficiente numeric, fido_proposto numeric, fido_proposto_senza_coefficiente numeric, fido_attuale numeric, scostamento numeric, regola_applicata text, sede_cinisello boolean, richiede_verifica boolean, nota_proposta text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS MATERIALIZED (
    SELECT
      public.store_id_effettivo(NULL) AS sid,
      GREATEST(1, LEAST(36, COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_mesi_rolling')), '')::int, 12))) AS mesi,
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_ponderazione')), ''), 'pesata')) = 'pesata') AS pesata,
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_coefficienti')), ''), 'true')) IN ('true','t','1','si','sì')) AS usa_coef,
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_escludi_sede')), ''), 'false')) IN ('true','t','1','si','sì')) AS escludi_sede,
      GREATEST(0, COALESCE(NULLIF(regexp_replace(trim(COALESCE((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_soglia_verifica_eur'), '5000')), '[^0-9.]', '', 'g'), '')::numeric, 5000))::numeric AS soglia,
      COALESCE(
        (SELECT array_agg(v) FROM (
           SELECT regexp_replace(x, '\D', '', 'g') AS v
           FROM unnest(string_to_array(COALESCE((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_piva_escluse'), ''), ',')) AS x
         ) q WHERE q.v <> ''),
        ARRAY[]::text[]
      ) AS pive
  ),
  pesi AS MATERIALIZED (
    SELECT COALESCE(sum(public.peso_mese_fido(i)), 0)::numeric AS somma_pesi
    FROM cfg, generate_series(0, (SELECT mesi FROM cfg) - 1) AS i
  ),
  cli AS MATERIALIZED (
    SELECT
      c.id,
      c.store_id,
      regexp_replace(COALESCE(c.partita_iva, ''), '\D', '', 'g') AS piva,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      g.giorni_totali AS gg,
      COALESCE(g.pagamento_immediato, false) AS immediato,
      COALESCE(c.num_insoluti, 0)::int AS insoluti,
      CASE WHEN c.dilazione_effettiva IS NULL OR c.dilazione_concordata IS NULL THEN 0
           ELSE (c.dilazione_effettiva - c.dilazione_concordata)::int END AS gg_oltre
    FROM public.clienti c
    CROSS JOIN cfg
    LEFT JOIN public.codici_pagamento cp ON cp.cod = c.condizione_pagamento_cod
    LEFT JOIN public.codici_pagamento_giorni g
      ON lower(trim(g.descrizione)) = lower(trim(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione)))
    WHERE (cfg.sid IS NULL OR c.store_id = cfg.sid)
      AND (_cliente_ids IS NULL OR c.id = ANY(_cliente_ids))
  ),
  fatt AS (
    SELECT
      m.cliente_id,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => ((SELECT mesi FROM cfg) - 1)))::date
      ), 0::numeric) AS rolling,
      COALESCE(sum(m.importo_lordo * public.peso_mese_fido(
        ((EXTRACT(year FROM age(date_trunc('month', CURRENT_DATE), m.mese)) * 12)
          + EXTRACT(month FROM age(date_trunc('month', CURRENT_DATE), m.mese)))::int
      )) FILTER (
        WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => ((SELECT mesi FROM cfg) - 1)))::date
      ), 0::numeric) AS rolling_pesato,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE)
      ), 0::numeric) AS anno_corrente,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE) - 1
      ), 0::numeric) AS anno_precedente
    FROM public.fatturato_mensile_cliente m
    WHERE m.cliente_id IN (SELECT id FROM cli)
    GROUP BY m.cliente_id
  ),
  patol AS (
    SELECT s.cliente_id, true AS patologico
    FROM public.scadenze s
    WHERE s.cliente_id IN (SELECT id FROM cli)
      AND s.stato_contabile = 'Aperta'
      AND COALESCE(s.importo_scadenza, 0) > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
      AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%')
    GROUP BY s.cliente_id
  ),
  base AS (
    SELECT
      b.id, b.store_id, b.piva, cfg.pive AS pive, b.fa, b.gg, b.immediato,
      b.insoluti, b.gg_oltre, cfg.usa_coef, cfg.escludi_sede, cfg.soglia,
      COALESCE(f.rolling, 0)::numeric AS r12,
      CASE WHEN cfg.pesata
        THEN COALESCE(f.rolling_pesato, 0)::numeric / NULLIF((SELECT somma_pesi FROM pesi), 0)
        ELSE COALESCE(f.rolling, 0)::numeric / cfg.mesi::numeric
      END AS ritmo,
      COALESCE(f.anno_corrente, 0)::numeric AS ac,
      COALESCE(f.anno_precedente, 0)::numeric AS ap,
      COALESCE(p.patologico, false) AS patol_sc,
      COALESCE(p.patologico, false) OR b.insoluti > 0 AS patologico
    FROM cli b
    CROSS JOIN cfg
    LEFT JOIN fatt f ON f.cliente_id = b.id
    LEFT JOIN patol p ON p.cliente_id = b.id
  ),
  calc AS (
    SELECT b.*,
      GREATEST(0, COALESCE(b.ritmo, 0) * COALESCE(b.gg, 0) / 30.0) AS fb,
      public.coefficiente_comportamento(b.gg_oltre, b.patologico, b.insoluti) AS coef,
      (b.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid) AS cinisello
    FROM base b
  ),
  fin AS (
    SELECT c.*,
      CASE
        WHEN c.cinisello AND c.escludi_sede THEN 'sede_esclusa'
        WHEN c.piva <> '' AND c.piva = ANY(c.pive) THEN 'esclusa_gruppo'
        WHEN c.gg IS NULL THEN 'condizione_mancante'
        WHEN c.immediato THEN 'pagamento_immediato'
        WHEN c.r12 <= 0 AND c.ap > 0 AND c.ac <= 0 THEN 'minimo_500'
        WHEN c.r12 <= 0 THEN 'nessun_fatturato'
        WHEN c.fb <= 5000 THEN 'fascia_500'
        ELSE 'fascia_5000'
      END AS regola
    FROM calc c
  ),
  ris AS (
    SELECT f.*,
      CASE WHEN f.regola IN ('fascia_500','fascia_5000') AND f.usa_coef THEN f.coef ELSE 1::numeric END AS coef_eff,
      CASE f.regola
        WHEN 'sede_esclusa' THEN f.fa
        WHEN 'esclusa_gruppo' THEN f.fa
        WHEN 'condizione_mancante' THEN 0::numeric
        WHEN 'pagamento_immediato' THEN 0::numeric
        WHEN 'nessun_fatturato' THEN 0::numeric
        WHEN 'minimo_500' THEN 500::numeric
        ELSE public.arrotonda_fido_proposto(f.fb)
      END AS fp_senza
    FROM fin f
  ),
  fine AS (
    SELECT r.*,
      CASE WHEN r.regola IN ('fascia_500','fascia_5000') AND r.usa_coef
        THEN public.arrotonda_fido_proposto(r.fb * r.coef)
        ELSE r.fp_senza
      END AS fp
    FROM ris r
  ),
  nota AS (
    SELECT r.*,
      (r.fa > 0 AND r.fp < r.fa * 0.5 AND abs(r.fa - r.fp) >= r.soglia) AS riduzione_forte,
      (r.fa > 0 AND r.fp > r.fa * 2 AND abs(r.fa - r.fp) >= r.soglia) AS aumento_forte,
      CASE
        WHEN r.fa > 0 AND r.fp < r.fa * 0.5
          THEN 'Riduzione del ' || round((r.fa - r.fp) / r.fa * 100)::int || '% rispetto al fido attuale. '
        WHEN r.fa > 0 AND r.fp > r.fa * 2
          THEN 'Aumento di oltre il doppio: ritmo di acquisto in crescita. '
        ELSE ''
      END
      ||
      CASE r.regola
        WHEN 'sede_esclusa' THEN 'Sede di Cinisello Balsamo esclusa dal calcolo: mantiene il fido attuale.'
        WHEN 'esclusa_gruppo' THEN 'Società del gruppo: esclusa dal calcolo, mantiene il fido attuale.'
        WHEN 'condizione_mancante' THEN 'Condizione di pagamento mancante in anagrafica: importo non calcolabile.'
        WHEN 'pagamento_immediato' THEN 'Pagamento immediato (contanti, POS o assegno): nessuna esposizione, fido non necessario.'
        WHEN 'nessun_fatturato' THEN 'Nessun fatturato nella finestra di calcolo.'
        WHEN 'minimo_500' THEN 'Fatturato presente solo nell''anno precedente: proposta al minimo di 500 €.'
        ELSE
          CASE
            WHEN r.usa_coef AND r.insoluti > 0
              THEN 'Nessuna proposta: cliente con ' || r.insoluti || ' insolut' || CASE WHEN r.insoluti = 1 THEN 'o' ELSE 'i' END || '.'
            WHEN r.usa_coef AND r.coef_eff < 1
              THEN 'Coefficiente ' || replace(to_char(r.coef_eff, 'FM0.00'), '.', ',') || ' per profilo '
                   || CASE WHEN r.patologico THEN 'patologico' ELSE 'sano' END || ': '
                   || CASE WHEN r.gg_oltre > 0 THEN r.gg_oltre || ' giorni oltre i termini concordati'
                           ELSE 'pagamenti nei termini concordati' END
                   || CASE WHEN r.patol_sc THEN ' e scaduto con anzianità oltre 60 giorni.'
                           ELSE ' e nessun insoluto (ritardo fisiologico).' END
            ELSE 'Fido base ' || replace(to_char(round(r.fb), 'FM999,999,999'), ',', '.') || ' € da un ritmo di '
                 || replace(to_char(round(r.ritmo), 'FM999,999,999'), ',', '.') || ' €/mese su ' || COALESCE(r.gg, 0)
                 || ' giorni di dilazione. Nessuna riduzione: pagamenti nei termini.'
          END
      END AS nota_txt
    FROM fine r
  )
  SELECT r.id, r.r12, r.ritmo, r.gg, (r.gg IS NULL), r.fb, r.fb,
    r.gg_oltre,
    CASE WHEN r.patologico THEN 'patologico' ELSE 'sano' END,
    r.coef_eff, r.fp, r.fp_senza, r.fa, r.fp - r.fa, r.regola,
    r.cinisello,
    (r.riduzione_forte OR r.aumento_forte),
    r.nota_txt
  FROM nota r
  WHERE (NOT _solo_condizione_mancante) OR r.regola = 'condizione_mancante';
$function$;