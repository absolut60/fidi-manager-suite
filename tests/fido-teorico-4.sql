-- FM55 fetta 4: sola lettura, nessun ricalcolo o scrittura. Dati reali al 01/11/2026.
WITH c AS (
  SELECT id, ragione_sociale FROM public.clienti WHERE ragione_sociale IN
   ('F.D. COSTRUZIONI EDILI SRLS','EDIL ARCA SRLS','ELSAWY MOHAMED','BERGUM IMMOBILI SPA','CAMBIEDIL SRLS',
    'GF COSTRUZIONI SAS DI CERATI GIOVANNI & C','A.N. COSTRUZIONI SRL','GALLO SRL','GMP EDILE S.R.L.','OTTO GROUP SRL','KREKU ENDRI')
), atteso(ragione_sociale, fp) AS (VALUES
  ('F.D. COSTRUZIONI EDILI SRLS',25000),('EDIL ARCA SRLS',10000),('ELSAWY MOHAMED',15000),('BERGUM IMMOBILI SPA',55000),
  ('CAMBIEDIL SRLS',3000),('GF COSTRUZIONI SAS DI CERATI GIOVANNI & C',20000),('A.N. COSTRUZIONI SRL',500000),
  ('GALLO SRL',55000),('GMP EDILE S.R.L.',60000),('OTTO GROUP SRL',30000),('KREKU ENDRI',5000))
SELECT a.ragione_sociale caso, v.fido_proposto = a.fp ok
FROM atteso a JOIN c ON c.ragione_sociale = a.ragione_sociale
CROSS JOIN LATERAL public.get_fido_teorico_v2(ARRAY[c.id]) v
UNION ALL
SELECT 'F.D. frase paracadute ordini', v.spiegazione LIKE '%per consegnarli senza bloccarlo il fido non scende sotto 25.000 €.'
FROM c CROSS JOIN LATERAL public.get_fido_teorico_v2(ARRAY[c.id]) v WHERE c.ragione_sociale='F.D. COSTRUZIONI EDILI SRLS'
UNION ALL
SELECT 'F.D. consumo senza ordini', v.consumo_perc = round(v.esposizione / v.fido_attuale, 4)
FROM c CROSS JOIN LATERAL public.get_fido_teorico_v2(ARRAY[c.id]) v WHERE c.ragione_sociale='F.D. COSTRUZIONI EDILI SRLS';
