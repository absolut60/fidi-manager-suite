-- FM56 fetta 1: fonte unica dei gruppi delle card della Dashboard fidi.
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
  al AS MATERIALIZED (
    SELECT DISTINCT a.cliente_id FROM public.alert_fidi a
    WHERE a.tipo = 'consumo' AND a.stato <> 'chiuso'
  )
  SELECT cl.id, cl.fido_gestionale, cl.fido_proposto, cl.totale_rischio, cl.categoria,
    CASE WHEN COALESCE(cl.attivo,true)
      THEN GREATEST(COALESCE(cl.totale_rischio,0) - COALESCE(cl.fido_gestionale,0), 0) ELSE 0 END,
    public.cliente_attivo(cl.ultima_data_fatturazione, cl.doc_da_fatturare)
      AND COALESCE(fat.tot,0) = 0
      AND cl.categoria IN ('imprese','privati')
      AND COALESCE(cl.doc_da_fatturare,0) <= 0
      AND COALESCE(cl.doc_da_evadere,0) <= 0,
    cl.categoria = 'imprese' AND al.cliente_id IS NOT NULL,
    cl.categoria = 'imprese' AND COALESCE('oltre_normale' = ANY(cl.segnalazioni), false),
    cl.categoria = 'imprese' AND COALESCE('ordini_oltre_fido' = ANY(cl.segnalazioni), false)
  FROM cl
  LEFT JOIN fat ON fat.cliente_id = cl.id
  LEFT JOIN al ON al.cliente_id = cl.id
$function$;

-- Appartenenza (card, gruppo) per cliente: unica regola usata da aggregati e liste.
CREATE OR REPLACE FUNCTION public.dashboard_fidi_appartenenze()
 RETURNS TABLE(cliente_id uuid, card text, gruppo text, importo numeric,
               aumento boolean, riduzione boolean, con_fido boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH b AS MATERIALIZED (SELECT * FROM public.dashboard_fidi_clienti_base())
  SELECT b.cliente_id, 'concesso', b.categoria, COALESCE(b.fido_gestionale,0), false, false, true
    FROM b WHERE COALESCE(b.fido_gestionale,0) > 0
  UNION ALL
  SELECT b.cliente_id, 'concesso', 'fermi', COALESCE(b.fido_gestionale,0), false, false, true
    FROM b WHERE b.fermo AND COALESCE(b.fido_gestionale,0) > 0
  UNION ALL
  SELECT b.cliente_id, 'proposto', b.categoria, COALESCE(b.fido_proposto,0), false, false, COALESCE(b.fido_gestionale,0) > 0
    FROM b WHERE COALESCE(b.fido_proposto,0) > 0
  UNION ALL
  SELECT b.cliente_id, 'variazione', b.categoria, COALESCE(b.fido_proposto,0) - COALESCE(b.fido_gestionale,0),
         COALESCE(b.fido_proposto,0) > COALESCE(b.fido_gestionale,0),
         COALESCE(b.fido_proposto,0) < COALESCE(b.fido_gestionale,0),
         COALESCE(b.fido_gestionale,0) > 0
    FROM b WHERE COALESCE(b.fido_proposto,0) > 0 OR COALESCE(b.fido_gestionale,0) > 0
  UNION ALL
  SELECT b.cliente_id, 'oltre', b.categoria, b.oltre_fido, false, false, COALESCE(b.fido_gestionale,0) > 0
    FROM b WHERE b.oltre_fido > 0
  UNION ALL
  SELECT b.cliente_id, 'fermi', b.categoria, COALESCE(b.fido_gestionale,0), false, false, COALESCE(b.fido_gestionale,0) > 0
    FROM b WHERE b.fermo
  UNION ALL
  SELECT b.cliente_id, 'occhio', g.gruppo, COALESCE(b.fido_gestionale,0), false, false, COALESCE(b.fido_gestionale,0) > 0
    FROM b CROSS JOIN LATERAL (VALUES
      ('vicini', b.occhio_vicino), ('piu', b.occhio_piu), ('ordini', b.occhio_ordini),
      ('totale', b.occhio_vicino OR b.occhio_piu OR b.occhio_ordini)) AS g(gruppo, ok)
    WHERE g.ok
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_fidi_gruppi()
 RETURNS TABLE(card text, gruppo text, n_clienti bigint, importo numeric,
               n_aumenti bigint, n_riduzioni bigint, n_con_fido bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH a AS MATERIALIZED (SELECT * FROM public.dashboard_fidi_appartenenze()),
  griglia AS MATERIALIZED (
    SELECT c.card, g.gruppo, c.ord * 10 + g.ord AS ord
    FROM (VALUES ('concesso',1),('proposto',2),('variazione',3),('oltre',4)) c(card, ord)
    CROSS JOIN (VALUES ('imprese',1),('privati',2),('contanti_pos',3),('bloccati',4),('legale',5)) g(gruppo, ord)
    UNION ALL SELECT 'concesso','fermi',16
    UNION ALL SELECT 'fermi','imprese',51 UNION ALL SELECT 'fermi','privati',52
    UNION ALL SELECT 'occhio','vicini',61 UNION ALL SELECT 'occhio','piu',62
    UNION ALL SELECT 'occhio','ordini',63 UNION ALL SELECT 'occhio','totale',64
  ),
  agg AS MATERIALIZED (
    SELECT a.card, a.gruppo, COUNT(*) AS n, SUM(a.importo) AS imp,
           COUNT(*) FILTER (WHERE a.aumento) AS na, COUNT(*) FILTER (WHERE a.riduzione) AS nr,
           COUNT(*) FILTER (WHERE a.con_fido) AS ncf
    FROM a GROUP BY a.card, a.gruppo
  )
  SELECT g.card, g.gruppo, COALESCE(agg.n,0), COALESCE(agg.imp,0),
         COALESCE(agg.na,0), COALESCE(agg.nr,0), COALESCE(agg.ncf,0)
  FROM griglia g LEFT JOIN agg ON agg.card = g.card AND agg.gruppo = g.gruppo
  ORDER BY g.ord
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_dashboard_fidi_ids(_card text, _gruppo text)
 RETURNS TABLE(cliente_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.cliente_id FROM public.dashboard_fidi_appartenenze() a
  WHERE a.card = _card AND a.gruppo = _gruppo
$function$;

REVOKE EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_fidi_appartenenze() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_fidi_gruppi() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_clienti_dashboard_fidi_ids(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_fidi_appartenenze() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi_gruppi() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clienti_dashboard_fidi_ids(text, text) TO authenticated, service_role;
