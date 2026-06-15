
CREATE OR REPLACE FUNCTION public.get_clienti_senza_email_con_scadenze()
RETURNS TABLE(
  cliente_id uuid,
  codice_gestionale text,
  ragione_sociale text,
  email text,
  pec text,
  store_nome text,
  totale_scaduto numeric,
  totale_a_scadere numeric,
  n_scadenze_aperte int
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      CASE
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%a scadere%' THEN 'a_scadere'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%' THEN 'scaduto'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%pagat%' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) > 0 THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) <= 0 THEN 'a_scadere'
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
  ),
  agg AS (
    SELECT cliente_id,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat = 'scaduto'), 0) AS tot_scaduto,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat = 'a_scadere'), 0) AS tot_a_scadere,
      COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere'))::int AS n_aperte
    FROM cls
    GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere')) > 0
  )
  SELECT c.id, c.codice_gestionale, c.ragione_sociale, c.email, c.pec,
         st.nome, agg.tot_scaduto, agg.tot_a_scadere, agg.n_aperte
  FROM agg
  JOIN public.clienti c ON c.id = agg.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE (c.email IS NULL OR btrim(c.email) = '')
  ORDER BY st.nome ASC NULLS LAST, agg.tot_scaduto DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_senza_email_con_scadenze() TO authenticated;
