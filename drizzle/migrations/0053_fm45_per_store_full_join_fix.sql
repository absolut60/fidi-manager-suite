-- FM45 Fetta 2b: correzione FULL JOIN di get_scadenziario_per_store (chiave hashabile per store NULL).
CREATE OR REPLACE FUNCTION public.get_scadenziario_per_store(p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text, p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text, p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false, p_agente text DEFAULT NULL::text, p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0, p_netto_coperture boolean DEFAULT false)
 RETURNS TABLE(store_id uuid, store_nome text, n_clienti_scaduti integer, tot_scaduto numeric, tot_a_scadere numeric, n_bloccati integer, n_in_legale integer, tot_coperto_piani numeric, tot_coperto_promesse numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Stesse regole di get_scadenziario_totali (da scadenziario_clienti_base), per punto vendita.
  -- I "di cui" sono sempre sull'insieme a filtro spento.
  WITH m AS (
    SELECT COALESCE(b.store_id, '00000000-0000-0000-0000-000000000000'::uuid) AS k, b.store_id AS sid,
      COUNT(*) FILTER (WHERE b.tot_s > 0)::int AS n_s,
      COALESCE(SUM(b.tot_s) FILTER (WHERE b.tot_s > 0), 0) AS t_s,
      COALESCE(SUM(b.tot_a), 0) AS t_a,
      COUNT(*) FILTER (WHERE b.bloccato)::int AS n_b,
      COUNT(*) FILTER (WHERE b.in_gestione_legale)::int AS n_l
    FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, p_netto_coperture) b
    GROUP BY b.store_id
  ),
  d AS (
    SELECT COALESCE(b.store_id, '00000000-0000-0000-0000-000000000000'::uuid) AS k, b.store_id AS sid,
      COALESCE(SUM(b.coperto_piani) FILTER (WHERE b.tot_s_lordo > 0), 0) AS cp,
      COALESCE(SUM(b.coperto_promesse) FILTER (WHERE b.tot_s_lordo > 0), 0) AS cpr
    FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, false) b
    GROUP BY b.store_id
  )
  SELECT COALESCE(m.sid, d.sid), COALESCE(st.nome, 'Senza negozio')::text,
    COALESCE(m.n_s, 0), COALESCE(m.t_s, 0), COALESCE(m.t_a, 0), COALESCE(m.n_b, 0), COALESCE(m.n_l, 0),
    COALESCE(d.cp, 0), COALESCE(d.cpr, 0)
  FROM m FULL JOIN d ON d.k = m.k
  LEFT JOIN public.stores st ON st.id = COALESCE(m.sid, d.sid)
  ORDER BY 4 DESC
$function$;
