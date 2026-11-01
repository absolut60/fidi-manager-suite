-- Test SQL di sola lettura: nessun ricalcolo e nessuna scrittura.
-- Risultati attesi: tutte le colonne ok = true.
SELECT 'margine senza tetto e senza ordini' AS caso,
  fp = 15000 AND valore = 12500 AND tetto = 1500 AND ordini_fuori = 0 AND margine AS ok
FROM public.fido_v2_margine_tetto(1000,10000,999999,100,9999)
UNION ALL
SELECT 'ordini non aumentano il fido',
  fp = 5000 AND valore = 5000 AND ordini_fuori = 0 AND NOT margine
FROM public.fido_v2_margine_tetto(5000,0,999999,100,0)
UNION ALL
SELECT 'oltre normale usa proposta arrotondata',
  'oltre_normale' = ANY(public.segnalazioni_fido('calcolo',1000,2000,0,5000,0,0,0,3000,1500))
UNION ALL
SELECT 'uguaglianza al normale non segnala',
  NOT ('oltre_normale' = ANY(public.segnalazioni_fido('calcolo',1000,1000,0,5000,0,0,0,2000,1500)))
UNION ALL
SELECT 'ordini oltre proposta',
  'ordini_oltre_fido' = ANY(public.segnalazioni_fido('calcolo',5000,4000,1001,5000,0,0,0,5000,7500))
UNION ALL
SELECT 'ordini pari alla proposta non segnalano',
  NOT ('ordini_oltre_fido' = ANY(public.segnalazioni_fido('calcolo',5000,4000,1000,5000,0,0,0,5000,7500)))
UNION ALL
SELECT 'nessun vecchio codice',
  NOT (public.segnalazioni_fido('calcolo',1000,20000,50000,10000,0,0,99999,25000,1500)
    && ARRAY['impegni_sopra_base','ordine_fuori_giro','oltre_tetto'])
UNION ALL
SELECT 'bloccato resta segnalato',
  'bloccato' = ANY(public.segnalazioni_fido('cliente_bloccato',0,5000,0,5000,0,0,0,0,0))
UNION ALL
SELECT 'scaduto non incassato resta segnalato',
  'scaduto_non_incassato' = ANY(public.segnalazioni_fido('scaduto_non_incassato',5000,10000,0,5000,1000,0,0,0,7500));

-- Confronto indipendente delle medie sui tre clienti reali richiesti.
WITH cfg AS (
  SELECT date_trunc('month',CURRENT_DATE)::date m0,
    (SELECT array_agg(trim(x)::numeric/100 ORDER BY o)
       FROM unnest(string_to_array((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_stagionalita'),',')) WITH ORDINALITY u(x,o)) idx
), cli AS (
  SELECT id,doc_da_fatturare FROM public.clienti WHERE codice_gestionale IN ('7457','7819','13380')
), primo AS (
  SELECT cliente_id,min(mese) mese FROM (
    SELECT m.cliente_id,m.mese FROM public.fatturato_mensile_cliente m JOIN cli c ON c.id=m.cliente_id WHERE m.importo_lordo>0
    UNION ALL SELECT c.id,(cfg.m0-interval '1 month')::date FROM cli c CROSS JOIN cfg WHERE c.doc_da_fatturare>0
  ) a GROUP BY cliente_id
), mesi AS (
  SELECT c.id,cfg.m0,p.mese primo,
    (cfg.m0-make_interval(months=>k))::date mese,
    cfg.idx[EXTRACT(month FROM cfg.m0-make_interval(months=>k))::int] indice,
    COALESCE(m.importo_lordo,0)+CASE WHEN k=1 THEN COALESCE(c.doc_da_fatturare,0) ELSE 0 END imp
  FROM cli c CROSS JOIN cfg CROSS JOIN generate_series(1,12) k
  LEFT JOIN primo p ON p.cliente_id=c.id
  LEFT JOIN public.fatturato_mensile_cliente m ON m.cliente_id=c.id AND m.mese=(cfg.m0-make_interval(months=>k))::date
), attesi AS (
  SELECT id,sum(imp) FILTER(WHERE mese>=primo)/NULLIF(sum(indice) FILTER(WHERE mese>=primo),0) storico,
    sum(imp) FILTER(WHERE mese>=primo AND mese>=m0-interval '3 months')/NULLIF(sum(indice) FILTER(WHERE mese>=primo AND mese>=m0-interval '3 months'),0) tendenza
  FROM mesi GROUP BY id
)
SELECT v.cliente_id,
  v.acquisto_storico=round(a.storico,2) AS storico_ok,
  v.acquisto_tendenza=round(a.tendenza,2) AS tendenza_ok,
  v.acquisto_mensile=round(COALESCE((2*a.storico+a.tendenza)/3,a.storico,a.tendenza,0),2) AS medio_ok,
  v.fabbisogno=v.esposizione AS esposizione_senza_ordini_ok
FROM public.get_fido_teorico_v2((SELECT array_agg(id) FROM cli)) v JOIN attesi a ON a.id=v.cliente_id;