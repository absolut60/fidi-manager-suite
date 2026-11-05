-- FM56 fetta 1c: stessa regola; join su chiavi con sentinella (hash join) al posto di IS NOT DISTINCT FROM, che portava a un nested loop lento.
CREATE OR REPLACE FUNCTION public.dashboard_fidi_clienti_base()
 RETURNS TABLE(cliente_id uuid, fido_gestionale numeric, fido_proposto numeric, totale_rischio numeric,
               categoria text, oltre_fido numeric, fermo boolean,
               occhio_vicino boolean, occhio_piu boolean, occhio_ordini boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL) AS sid),
  cl AS MATERIALIZED (
    SELECT c.id, c.fido_gestionale, c.totale_rischio, c.attivo, c.doc_da_fatturare, c.doc_da_evadere,
           c.ultima_data_fatturazione, f.fido_proposto, f.segnalazioni,
           COALESCE(c.ultima_data_fatturazione, '-infinity'::date) AS k_d,
           COALESCE(c.doc_da_fatturare, 'NaN'::numeric) AS k_f,
           CASE
             WHEN COALESCE(c.in_gestione_legale,false) THEN 'legale'
             WHEN COALESCE(c.bloccato,false) THEN 'bloccati'
             WHEN f.regola_applicata = 'pagamento_immediato' THEN 'contanti_pos'
             WHEN public.cliente_privato_fido(c.partita_iva) AND NOT public.cliente_sede_centrale_fido(c.store_id) THEN 'privati'
             ELSE 'imprese'
           END AS categoria
    FROM public.clienti c CROSS JOIN eff
    LEFT JOIN public.fido_teorico_cliente f ON f.cliente_id = c.id
    WHERE eff.sid IS NULL OR c.store_id = eff.sid
  ),
  fat AS MATERIALIZED (
    SELECT m.cliente_id, SUM(m.importo_lordo) AS tot
    FROM public.fatturato_mensile_cliente m
    WHERE m.mese >= (date_trunc('month', current_date) - interval '3 months')::date
    GROUP BY m.cliente_id
  ),
  -- cliente_attivo (fonte unica) valutata una volta per coppia distinta di argomenti
  att AS MATERIALIZED (
    SELECT u.k_d, u.k_f, public.cliente_attivo(u.d, u.f) AS ok
    FROM (SELECT DISTINCT ON (cl.k_d, cl.k_f) cl.k_d, cl.k_f,
                 cl.ultima_data_fatturazione AS d, cl.doc_da_fatturare AS f
          FROM cl ORDER BY cl.k_d, cl.k_f) u
  ),
  al AS MATERIALIZED (
    SELECT DISTINCT a.cliente_id FROM public.alert_fidi a
    WHERE a.tipo = 'consumo' AND a.stato <> 'chiuso'
  )
  SELECT cl.id, cl.fido_gestionale, cl.fido_proposto, cl.totale_rischio, cl.categoria,
    CASE WHEN COALESCE(cl.attivo,true)
      THEN GREATEST(COALESCE(cl.totale_rischio,0) - COALESCE(cl.fido_gestionale,0), 0) ELSE 0 END,
    CASE WHEN COALESCE(fat.tot,0) = 0
           AND cl.categoria IN ('imprese','privati')
           AND COALESCE(cl.doc_da_fatturare,0) <= 0
           AND COALESCE(cl.doc_da_evadere,0) <= 0
         THEN COALESCE(att.ok, false)
         ELSE false END,
    cl.categoria = 'imprese' AND al.cliente_id IS NOT NULL,
    cl.categoria = 'imprese' AND COALESCE('oltre_normale' = ANY(cl.segnalazioni), false),
    cl.categoria = 'imprese' AND COALESCE('ordini_oltre_fido' = ANY(cl.segnalazioni), false)
  FROM cl
  LEFT JOIN fat ON fat.cliente_id = cl.id
  LEFT JOIN al ON al.cliente_id = cl.id
  LEFT JOIN att ON att.k_d = cl.k_d AND att.k_f = cl.k_f
$function$;

REVOKE EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() TO authenticated, service_role;
