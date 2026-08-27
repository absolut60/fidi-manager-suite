CREATE OR REPLACE FUNCTION public.get_scaduto_dashboard(_store_id uuid DEFAULT NULL)
RETURNS TABLE(scaduto_tot numeric, scaduto_over60 numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS sid),
  cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.data_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo
    FROM public.scadenze s
    WHERE s.stato_contabile='Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
      AND upper(COALESCE(s.codice_pagamento,'')) <> 'BOS'
  ),
  agg AS (
    SELECT cls.cliente_id,
      public.calcola_scaduto(
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE NOT cls.is_anticipo),0),
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.is_anticipo),0)) AS tot_s,
      public.calcola_scaduto(
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE NOT cls.is_anticipo AND cls.data_scadenza < CURRENT_DATE-60),0),
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.is_anticipo AND cls.data_scadenza < CURRENT_DATE-60),0)) AS over60_s
    FROM cls GROUP BY cls.cliente_id
  )
  SELECT
    COALESCE(SUM(a.tot_s) FILTER (WHERE a.tot_s>0 AND NOT COALESCE(cl.in_gestione_legale,false)),0),
    COALESCE(SUM(a.over60_s) FILTER (WHERE a.tot_s>0 AND NOT COALESCE(cl.in_gestione_legale,false)),0)
  FROM agg a
  JOIN public.clienti cl ON cl.id=a.cliente_id
  CROSS JOIN eff
  WHERE (eff.sid IS NULL OR cl.store_id = eff.sid);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_scaduto_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scaduto_dashboard(uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_dashboard_fidi()
 RETURNS TABLE(fido_concesso_eur numeric, fido_concesso_clienti bigint, fido_concesso_piccoli_n bigint, fido_concesso_piccoli_eur numeric, fido_proposto_eur numeric, fido_proposto_clienti bigint, fido_proposto_piccoli_n bigint, fido_proposto_piccoli_eur numeric, da_verificare_n bigint, oltre_fido_n bigint, oltre_fido_eur numeric, insoluti_n bigint, insoluti_eur numeric, insoluti_non_bloccati_n bigint, fermi_n bigint, fermi_scaduto_eur numeric, scaduto_eur numeric, scaduto_over60_eur numeric, aggiornato_al text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL) AS sid),
  cl AS MATERIALIZED (
    SELECT c.id, c.fido_gestionale, c.totale_rischio, c.doc_da_evadere,
           c.num_insoluti, c.bloccato, c.attivo
    FROM public.clienti c CROSS JOIN eff
    WHERE eff.sid IS NULL OR c.store_id = eff.sid
  ),
  ft AS MATERIALIZED (
    SELECT ftc.fido_proposto, ftc.richiede_verifica
    FROM public.fido_teorico_cliente ftc
    JOIN cl ON cl.id = ftc.cliente_id
  ),
  scad_all AS MATERIALIZED (
    SELECT s.cliente_id,
      SUM(GREATEST(COALESCE(s.importo_scadenza,0) - COALESCE(s.importo_pagato,0), 0)) AS tot,
      SUM(GREATEST(COALESCE(s.importo_scadenza,0) - COALESCE(s.importo_pagato,0), 0))
        FILTER (WHERE s.data_scadenza < CURRENT_DATE - 60) AS over60
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  ),
  scad_per_cliente AS MATERIALIZED (
    SELECT a.cliente_id, a.tot, a.over60
    FROM scad_all a JOIN cl ON cl.id = a.cliente_id
  ),
  scd AS (SELECT scaduto_tot, scaduto_over60 FROM public.get_scaduto_dashboard(NULL)),
  fatt AS MATERIALIZED (
    SELECT f.cliente_id,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '12 months') AS a12,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months') AS a3
    FROM public.fatturato_mensile_cliente f
    GROUP BY f.cliente_id
  ),
  fermi AS MATERIALIZED (
    SELECT cl.id
    FROM cl JOIN fatt ON fatt.cliente_id = cl.id
    WHERE COALESCE(cl.attivo, true)
      AND COALESCE(fatt.a12, 0) > 0
      AND COALESCE(fatt.a3, 0) = 0
  ),
  fermi_sc AS (
    SELECT COALESCE(SUM(spc.tot), 0) AS tot
    FROM scad_per_cliente spc JOIN fermi ON fermi.id = spc.cliente_id
  ),
  agg_cl AS (
    SELECT
      COALESCE(SUM(fido_gestionale),0) AS fc_eur,
      COUNT(*) FILTER (WHERE COALESCE(fido_gestionale,0) > 0) AS fc_n,
      COUNT(*) FILTER (WHERE COALESCE(fido_gestionale,0) > 0 AND fido_gestionale <= 500) AS fcp_n,
      COALESCE(SUM(fido_gestionale) FILTER (WHERE COALESCE(fido_gestionale,0) > 0 AND fido_gestionale <= 500),0) AS fcp_eur,
      COUNT(*) FILTER (WHERE COALESCE(attivo,true) AND COALESCE(totale_rischio,0)+COALESCE(doc_da_evadere,0) > COALESCE(fido_gestionale,0)) AS of_n,
      COALESCE(SUM(COALESCE(totale_rischio,0)+COALESCE(doc_da_evadere,0)-COALESCE(fido_gestionale,0))
        FILTER (WHERE COALESCE(attivo,true) AND COALESCE(totale_rischio,0)+COALESCE(doc_da_evadere,0) > COALESCE(fido_gestionale,0)),0) AS of_eur,
      COUNT(*) FILTER (WHERE COALESCE(attivo,true) AND COALESCE(num_insoluti,0) > 0) AS ins_n,
      COALESCE(SUM(totale_rischio) FILTER (WHERE COALESCE(attivo,true) AND COALESCE(num_insoluti,0) > 0),0) AS ins_eur,
      COUNT(*) FILTER (WHERE COALESCE(attivo,true) AND COALESCE(num_insoluti,0) > 0 AND NOT COALESCE(bloccato,false)) AS ins_nb
    FROM cl
  ),
  agg_ft AS (
    SELECT
      COALESCE(SUM(fido_proposto),0) AS fp_eur,
      COUNT(*) FILTER (WHERE COALESCE(fido_proposto,0) > 0) AS fp_n,
      COUNT(*) FILTER (WHERE COALESCE(fido_proposto,0) > 0 AND fido_proposto <= 500) AS fpp_n,
      COALESCE(SUM(fido_proposto) FILTER (WHERE COALESCE(fido_proposto,0) > 0 AND fido_proposto <= 500),0) AS fpp_eur,
      COUNT(*) FILTER (WHERE richiede_verifica) AS dv_n
    FROM ft
  )
  SELECT a.fc_eur, a.fc_n, a.fcp_n, a.fcp_eur,
         b.fp_eur, b.fp_n, b.fpp_n, b.fpp_eur, b.dv_n,
         a.of_n, a.of_eur, a.ins_n, a.ins_eur, a.ins_nb,
         (SELECT COUNT(*) FROM fermi),
         (SELECT tot FROM fermi_sc),
         (SELECT scaduto_tot FROM scd),
         (SELECT scaduto_over60 FROM scd),
         (SELECT valore FROM public.configurazioni WHERE chiave = 'fatturato_mensile_ultimo_refresh')
  FROM agg_cl a CROSS JOIN agg_ft b
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi() TO authenticated, service_role, supabase_read_only_user;