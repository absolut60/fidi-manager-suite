-- FM55 fetta 3: sola lettura, nessun ricalcolo o scrittura.
-- Test sulle funzioni realmente applicate; dati clienti reali al 01/11/2026.
SELECT 'riduzione sopra normale non rossa' caso,
  NOT ('oltre_normale'=ANY(public.segnalazioni_fido('calcolo',10000,20000,0,30000,0,0,0,25000,15000))) ok
UNION ALL
SELECT 'aumento sopra normale rosso',
  'oltre_normale'=ANY(public.segnalazioni_fido('calcolo',10000,20000,0,20000,0,0,0,25000,15000))
UNION ALL
SELECT 'rinnovo sopra normale non rosso',
  NOT ('oltre_normale'=ANY(public.segnalazioni_fido('calcolo',10000,20000,0,25000,0,0,0,25000,15000)))
UNION ALL
SELECT 'GALLO frenato a 55000',fido_proposto=55000
FROM public.get_fido_teorico_v2(ARRAY['d5b879a7-2da1-47d7-95a0-fc51eb4f1d06'::uuid])
UNION ALL
SELECT 'GMP frenato a Gamma 60000',fido_proposto=60000 AND fido_proposto=fido_attuale
FROM public.get_fido_teorico_v2(ARRAY['c6d2e655-33b4-4cb2-8b82-622cb3d5a404'::uuid])
UNION ALL
SELECT 'OTTO non aumenta a fronte di picco 69023',fido_proposto=30000 AND fido_proposto=fido_attuale
FROM public.get_fido_teorico_v2(ARRAY['7705cad2-ebbe-4f09-b91f-9061a078bc0f'::uuid])
UNION ALL
SELECT 'KREKU tutti i pagamenti freno 5000',fido_proposto=5000 AND fido_proposto<fido_attuale
FROM public.get_fido_teorico_v2(ARRAY['3ae2bba0-d437-483f-b846-43b6c3be7307'::uuid])
UNION ALL
SELECT 'Sede Centrale esclusa incondizionatamente',regola='sede_esclusa' AND fido_proposto=fido_attuale
FROM public.get_fido_teorico_v2(ARRAY['9ed39ea9-5e1f-4b45-b3e4-5a35733f9bbd'::uuid]);

-- Confronto indipendente su quattro clienti, non sul dataset intero.
WITH ids AS (
  SELECT unnest(ARRAY['d5b879a7-2da1-47d7-95a0-fc51eb4f1d06','c6d2e655-33b4-4cb2-8b82-622cb3d5a404',
    '7705cad2-ebbe-4f09-b91f-9061a078bc0f','3ae2bba0-d437-483f-b846-43b6c3be7307']::uuid[]) id
), giorni AS (SELECT CURRENT_DATE-k d FROM generate_series(0,29) k),
aperti AS (
  SELECT i.id,g.d,COALESCE(sum(s.importo_scadenza) FILTER(WHERE s.data_documento<=g.d
    AND (s.data_pagamento_effettiva IS NULL OR s.data_pagamento_effettiva>g.d)),0) aperto
  FROM ids i CROSS JOIN giorni g LEFT JOIN public.scadenze s ON s.cliente_id=i.id AND NOT public.is_anticipo(s.numero_documento)
  GROUP BY i.id,g.d
), attesi AS (
  SELECT id,max(aperto) picco,max(aperto) FILTER(WHERE d=CURRENT_DATE) oggi FROM aperti GROUP BY id
), primo_max AS (
  SELECT a.id,min(a.d) giorno FROM aperti a JOIN attesi x ON x.id=a.id AND a.aperto=x.picco GROUP BY a.id
)
SELECT p.cliente_id,p.aperto_oggi=x.oggi oggi_ok,p.aperto_picco=x.picco picco_ok,p.giorno_picco=m.giorno giorno_ok
FROM public.esposizione_picco_cliente(ARRAY(SELECT id FROM ids),30) p JOIN attesi x ON x.id=p.cliente_id JOIN primo_max m ON m.id=p.cliente_id;