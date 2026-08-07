DROP FUNCTION IF EXISTS public.get_dashboard_fidi();

CREATE OR REPLACE FUNCTION public.get_dashboard_fidi()
 RETURNS TABLE(fido_concesso_eur numeric, fido_concesso_clienti bigint, fido_concesso_piccoli_n bigint, fido_concesso_piccoli_eur numeric, fido_proposto_eur numeric, fido_proposto_clienti bigint, fido_proposto_piccoli_n bigint, fido_proposto_piccoli_eur numeric, da_verificare_n bigint, oltre_fido_n bigint, oltre_fido_eur numeric, insoluti_n bigint, insoluti_eur numeric, insoluti_non_bloccati_n bigint, fermi_n bigint, fermi_scaduto_eur numeric, scaduto_eur numeric, scaduto_over60_eur numeric, aggiornato_al text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(NULL) AS sid),
  cl AS (
    SELECT c.* FROM public.clienti c CROSS JOIN eff
    WHERE eff.sid IS NULL OR c.store_id = eff.sid
  ),
  ft AS (SELECT * FROM public.get_fido_teorico()),
  sc AS (
    SELECT
      COALESCE(SUM(GREATEST(COALESCE(s.importo_scadenza, 0) - COALESCE(s.importo_pagato, 0), 0)), 0) AS tot,
      COALESCE(SUM(GREATEST(COALESCE(s.importo_scadenza, 0) - COALESCE(s.importo_pagato, 0), 0))
        FILTER (WHERE s.data_scadenza < CURRENT_DATE - 60), 0) AS over60
    FROM public.scadenze s
    JOIN cl ON cl.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza < CURRENT_DATE
  ),
  fatt AS (
    SELECT f.cliente_id,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '12 months') AS a12,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months') AS a3
    FROM public.fatturato_mensile_cliente f
    GROUP BY f.cliente_id
  ),
  fermi AS (
    SELECT cl.id
    FROM cl JOIN fatt ON fatt.cliente_id = cl.id
    WHERE COALESCE(cl.attivo, true)
      AND COALESCE(fatt.a12, 0) > 0
      AND COALESCE(fatt.a3, 0) = 0
  ),
  fermi_sc AS (
    SELECT COALESCE(SUM(GREATEST(COALESCE(s.importo_scadenza, 0) - COALESCE(s.importo_pagato, 0), 0)), 0) AS tot
    FROM public.scadenze s
    JOIN fermi ON fermi.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza < CURRENT_DATE
  )
  SELECT
    (SELECT COALESCE(SUM(fido_gestionale), 0) FROM cl),
    (SELECT COUNT(*) FROM cl WHERE COALESCE(fido_gestionale, 0) > 0),
    (SELECT COUNT(*) FROM cl WHERE COALESCE(fido_gestionale, 0) > 0 AND fido_gestionale <= 500),
    (SELECT COALESCE(SUM(fido_gestionale), 0) FROM cl WHERE COALESCE(fido_gestionale, 0) > 0 AND fido_gestionale <= 500),
    (SELECT COALESCE(SUM(fido_proposto), 0) FROM ft),
    (SELECT COUNT(*) FROM ft WHERE COALESCE(fido_proposto, 0) > 0),
    (SELECT COUNT(*) FROM ft WHERE COALESCE(fido_proposto, 0) > 0 AND fido_proposto <= 500),
    (SELECT COALESCE(SUM(fido_proposto), 0) FROM ft WHERE COALESCE(fido_proposto, 0) > 0 AND fido_proposto <= 500),
    (SELECT COUNT(*) FROM ft WHERE richiede_verifica),
    (SELECT COUNT(*) FROM cl WHERE COALESCE(attivo, true)
        AND COALESCE(totale_rischio, 0) + COALESCE(doc_da_evadere, 0) > COALESCE(fido_gestionale, 0)),
    (SELECT COALESCE(SUM(COALESCE(totale_rischio, 0) + COALESCE(doc_da_evadere, 0) - COALESCE(fido_gestionale, 0)), 0)
       FROM cl WHERE COALESCE(attivo, true)
        AND COALESCE(totale_rischio, 0) + COALESCE(doc_da_evadere, 0) > COALESCE(fido_gestionale, 0)),
    (SELECT COUNT(*) FROM cl WHERE COALESCE(attivo, true) AND COALESCE(num_insoluti, 0) > 0),
    (SELECT COALESCE(SUM(totale_rischio), 0) FROM cl WHERE COALESCE(attivo, true) AND COALESCE(num_insoluti, 0) > 0),
    (SELECT COUNT(*) FROM cl WHERE COALESCE(attivo, true) AND COALESCE(num_insoluti, 0) > 0 AND NOT COALESCE(bloccato, false)),
    (SELECT COUNT(*) FROM fermi),
    (SELECT tot FROM fermi_sc),
    (SELECT tot FROM sc),
    (SELECT over60 FROM sc),
    (SELECT valore FROM public.configurazioni WHERE chiave = 'fatturato_mensile_ultimo_refresh')
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi() TO authenticated;