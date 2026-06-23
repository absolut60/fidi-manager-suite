
DROP FUNCTION IF EXISTS public.get_clienti_senza_email_con_scadenze();

CREATE OR REPLACE FUNCTION public.get_clienti_senza_email_con_scadenze()
 RETURNS TABLE(cliente_id uuid, codice_gestionale text, ragione_sociale text, email text, pec text, store_nome text, totale_scaduto numeric, totale_a_scadere numeric, n_scadenze_aperte integer, stato_email text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Fonte di verità validazione email: src/lib/email-validazione.ts
  -- Regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
  ),
  agg AS (
    SELECT cliente_id,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto'),0) AS tot_scaduto,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'),0) AS tot_a_scadere,
      COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere'))::int AS n_aperte
    FROM cls GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere')) > 0
  ),
  base AS (
    SELECT c.id, c.codice_gestionale, c.ragione_sociale, c.email, c.pec,
           st.nome AS store_nome, agg.tot_scaduto, agg.tot_a_scadere, agg.n_aperte,
           CASE
             WHEN c.email IS NULL OR btrim(c.email) = '' THEN 'vuota'
             WHEN btrim(c.email) ~ '[;,]' THEN 'multipla'
             WHEN position('@' IN btrim(c.email)) = 0 THEN 'non_email'
             WHEN btrim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 'ok'
             ELSE 'malformata'
           END AS stato_email
    FROM agg
    JOIN public.clienti c ON c.id = agg.cliente_id
    LEFT JOIN public.stores st ON st.id = c.store_id
  )
  SELECT id, codice_gestionale, ragione_sociale, email, pec, store_nome,
         tot_scaduto, tot_a_scadere, n_aperte, stato_email
  FROM base
  WHERE stato_email <> 'ok'
  ORDER BY store_nome ASC NULLS LAST, tot_scaduto DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_clienti_senza_email_con_scadenze() TO authenticated;
