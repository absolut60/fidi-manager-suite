ALTER TABLE public.fido_teorico_cliente
  ADD COLUMN IF NOT EXISTS semaforo_stadio text,
  ADD COLUMN IF NOT EXISTS semaforo_motivo text,
  ADD COLUMN IF NOT EXISTS semaforo_numero numeric;

CREATE OR REPLACE FUNCTION public.calcola_semaforo_affidabilita_batch(_ids uuid[])
RETURNS TABLE(cliente_id uuid, stadio text, motivo text, numero numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT c.id,
           COALESCE(c.bloccato, false) AS bloccato,
           COALESCE(c.in_gestione_legale, false) AS legale,
           COALESCE(c.num_insoluti, 0) AS insoluti
    FROM public.clienti c
    WHERE c.id = ANY(_ids)
  ),
  grave AS (
    SELECT s.cliente_id AS cid,
           COUNT(*)::int AS n_grave,
           COALESCE(SUM(s.importo_scadenza), 0) AS eur_grave
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND s.stato_contabile = 'Aperta'
      AND s.importo_scadenza > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
      AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%')
    GROUP BY s.cliente_id
  ),
  rit AS (
    SELECT s.cliente_id AS cid,
           COALESCE(ROUND(AVG((s.data_pagamento_effettiva - s.data_scadenza))
             FILTER (WHERE (s.data_pagamento_effettiva - s.data_scadenza) > 0)::numeric, 1), 0) AS ritardo
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.importo_pagato IS NOT NULL
      AND s.importo_pagato > 0
    GROUP BY s.cliente_id
  ),
  calc AS (
    SELECT b.id,
           b.bloccato, b.legale, b.insoluti,
           COALESCE(g.n_grave, 0) AS n_grave,
           COALESCE(g.eur_grave, 0) AS eur_grave,
           COALESCE(r.ritardo, 0) AS ritardo,
           translate(to_char(COALESCE(g.eur_grave, 0), 'FM999G999G990D00'), ',.', '.,') AS eur_txt
    FROM base b
    LEFT JOIN grave g ON g.cid = b.id
    LEFT JOIN rit r ON r.cid = b.id
  )
  SELECT
    c.id,
    CASE
      WHEN c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_grave > 10000 THEN 'rosso'
      WHEN c.n_grave > 0 THEN 'arancione'
      WHEN c.ritardo > 15 THEN 'giallo'
      ELSE 'verde'
    END AS stadio,
    CASE
      WHEN c.bloccato THEN 'Cliente bloccato'
      WHEN c.legale THEN 'In gestione legale'
      WHEN c.insoluti > 0 THEN c.insoluti || ' insoluto/i in corso'
      WHEN c.eur_grave > 10000 THEN 'Scaduto grave ' || c.eur_txt || ' € oltre 60 giorni'
      WHEN c.n_grave > 0 THEN 'Scaduto ' || c.eur_txt || ' € fermo oltre 60 giorni'
      WHEN c.ritardo > 15 THEN 'Ritardo medio ' || ROUND(c.ritardo)::text || ' giorni sui pagamenti'
      WHEN c.ritardo = 0 THEN 'Sempre puntuale'
      ELSE 'Pagamenti regolari'
    END AS motivo,
    CASE
      WHEN (c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_grave > 10000 OR c.n_grave > 0)
           AND c.eur_grave > 0 THEN c.eur_grave
      ELSE c.ritardo
    END AS numero
  FROM calc c;
$function$;

REVOKE ALL ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico_blocco(_dopo_id uuid, _dimensione integer DEFAULT 500)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_ids
  FROM (
    SELECT id FROM public.clienti
    WHERE (_dopo_id IS NULL OR id > _dopo_id)
    ORDER BY id
    LIMIT _dimensione
  ) s;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fido_teorico_cliente (
    cliente_id, fatturato_rolling, ritmo_mensile, giorni, giorni_mancanti,
    fido_base, fido_base_lordo, ddt_da_fatturare, giorni_oltre_accordo,
    profilo_pagamento, coefficiente, fido_proposto, fido_proposto_senza_coefficiente,
    fido_attuale, scostamento, regola_applicata, sede_cinisello, richiede_verifica,
    nota_proposta, fido_teorico_puro, pavimento_applicato, esposizione_corrente, calcolato_at
  )
  SELECT
    t.cliente_id, t.fatturato_rolling, t.ritmo_mensile, t.giorni, t.giorni_mancanti,
    t.fido_base, t.fido_base_lordo, t.ddt_da_fatturare, t.giorni_oltre_accordo,
    t.profilo_pagamento, t.coefficiente, t.fido_proposto, t.fido_proposto_senza_coefficiente,
    t.fido_attuale, t.scostamento, t.regola_applicata, t.sede_cinisello, t.richiede_verifica,
    t.nota_proposta, t.fido_teorico_puro, t.pavimento_applicato, t.esposizione_corrente, now()
  FROM public.get_fido_teorico(v_ids, false) t
  ON CONFLICT (cliente_id) DO UPDATE SET
    fatturato_rolling = EXCLUDED.fatturato_rolling,
    ritmo_mensile = EXCLUDED.ritmo_mensile,
    giorni = EXCLUDED.giorni,
    giorni_mancanti = EXCLUDED.giorni_mancanti,
    fido_base = EXCLUDED.fido_base,
    fido_base_lordo = EXCLUDED.fido_base_lordo,
    ddt_da_fatturare = EXCLUDED.ddt_da_fatturare,
    giorni_oltre_accordo = EXCLUDED.giorni_oltre_accordo,
    profilo_pagamento = EXCLUDED.profilo_pagamento,
    coefficiente = EXCLUDED.coefficiente,
    fido_proposto = EXCLUDED.fido_proposto,
    fido_proposto_senza_coefficiente = EXCLUDED.fido_proposto_senza_coefficiente,
    fido_attuale = EXCLUDED.fido_attuale,
    scostamento = EXCLUDED.scostamento,
    regola_applicata = EXCLUDED.regola_applicata,
    sede_cinisello = EXCLUDED.sede_cinisello,
    richiede_verifica = EXCLUDED.richiede_verifica,
    nota_proposta = EXCLUDED.nota_proposta,
    fido_teorico_puro = EXCLUDED.fido_teorico_puro,
    pavimento_applicato = EXCLUDED.pavimento_applicato,
    esposizione_corrente = EXCLUDED.esposizione_corrente,
    calcolato_at = now();

  UPDATE public.fido_teorico_cliente f
  SET semaforo_stadio = s.stadio,
      semaforo_motivo = s.motivo,
      semaforo_numero = s.numero
  FROM public.calcola_semaforo_affidabilita_batch(v_ids) s
  WHERE f.cliente_id = s.cliente_id;

  RETURN v_ids[array_length(v_ids, 1)];
END;
$function$;