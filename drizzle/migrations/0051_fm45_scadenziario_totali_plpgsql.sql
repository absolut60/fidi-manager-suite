-- FM45 Fetta 2a (prestazioni): get_scadenziario_totali in plpgsql (piani con
-- parametri costanti, come l'originale). Logica invariata rispetto a 0048.
CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(
  p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false, p_agente text DEFAULT NULL::text,
  p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0,
  p_netto_coperture boolean DEFAULT false)
RETURNS TABLE(n_clienti_totali integer, tot_scaduto numeric, tot_a_scadere numeric, n_clienti_scaduti integer,
  n_clienti_bloccati integer, n_clienti_in_legale integer, n_clienti_crediti integer, tot_crediti numeric,
  n_bonifici_esclusi integer, n_legale_esclusi integer,
  tot_coperto_piani numeric, tot_coperto_promesse numeric, n_clienti_coperti_piani integer,
  n_clienti_coperti_promesse integer, n_promesse_da_verificare integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  -- Calcolo per cliente: SOLO da scadenziario_clienti_base (fonte unica).
  WITH filt AS (
    SELECT * FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, p_netto_coperture)
  ),
  -- Clienti in legale nel perimetro (accesso + store + agente), come prima:
  -- stessa base senza filtri di importo/fascia/blocco/ricerca.
  leg AS (
    SELECT COUNT(*)::int AS n FROM public.scadenziario_clienti_base(NULL, p_store_id, 'tutte', 'tutti', 'in_legale',
      p_escludi_bonifici, false, 'tutti', 0, true, p_agente,
      CASE WHEN p_situazione = 'portafoglio' THEN 'portafoglio'
           WHEN COALESCE(p_situazione,'con_scaduto') = 'con_scaduto' THEN 'con_scaduto'
           ELSE 'tutte' END, 0, false)
  ),
  -- BOS non pagate dei soli clienti visibili e nei filtri store/agente.
  bon AS (
    SELECT COUNT(*)::int AS n
    FROM public.scadenze s
    JOIN public.clienti cl ON cl.id = s.cliente_id
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND upper(COALESCE(s.codice_pagamento,'')) = 'BOS'
      AND public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE) <> 'pagato'
      AND public.user_can_access_cliente(cl.id, cl.store_id, cl.codice_agente)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  )
  SELECT
    (SELECT COUNT(*)::int FROM filt),
    COALESCE((SELECT SUM(f.tot_s) FROM filt f WHERE f.tot_s > 0), 0),
    COALESCE((SELECT SUM(f.tot_a) FROM filt f), 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s > 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.bloccato = true),
    (SELECT n FROM leg),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s < 0),
    COALESCE((SELECT SUM(f.tot_s) FROM filt f WHERE f.tot_s < 0), 0),
    (SELECT n FROM bon),
    CASE WHEN p_escludi_legale THEN (SELECT n FROM leg) ELSE 0 END,
    COALESCE((SELECT SUM(f.coperto_piani) FROM filt f WHERE f.tot_s_lordo > 0), 0),
    COALESCE((SELECT SUM(f.coperto_promesse) FROM filt f WHERE f.tot_s_lordo > 0), 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s_lordo > 0 AND f.coperto_piani > 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s_lordo > 0 AND f.coperto_promesse > 0),
    COALESCE((SELECT SUM(f.n_promesse_data_passata) FROM filt f), 0)::int;
END;
$function$;