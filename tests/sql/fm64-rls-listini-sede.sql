-- FM64: real-data regression checks; no persistent writes.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}';
DO $test$
BEGIN
  ASSERT (SELECT array_agg(DISTINCT listino ORDER BY listino) = ARRAY[10,20,30]::smallint[] FROM public.articoli_gamma_listini), 'Admin: only 10/20/30';
  ASSERT (SELECT count(*) = 776 FROM public.prezzi_deposito_gamma), 'Admin: all 776 depot prices';
  ASSERT NOT EXISTS (SELECT 1 FROM public.prezzi_deposito_gamma WHERE listino=9), 'Admin: no list 9 depot prices';
  ASSERT (SELECT md5(string_agg(to_jsonb(l)::text,',' ORDER BY to_jsonb(l)::text)) = '15fa63d925f25fbc6012f902541942d5' FROM public.listini_articolo_visibili('ITA1000108') l), 'Admin: unchanged article price detail';
  ASSERT (SELECT md5(string_agg(to_jsonb(c)::text,',' ORDER BY codice)) = 'fb2ab72bc42318f1091c225ad30800c7' FROM public.cerca_articoli(testo=>'ITA1000108') c), 'Admin: unchanged search';
END;
$test$;
SET LOCAL request.jwt.claims = '{"sub":"3e29cea4-1756-4c88-b198-14d07bebfe02","role":"authenticated","aal":"aal2"}';
DO $test$
BEGIN
  ASSERT (SELECT array_agg(DISTINCT listino) = ARRAY[10]::smallint[] FROM public.articoli_gamma_listini), 'Cambiago: only list 10';
  ASSERT NOT EXISTS (SELECT 1 FROM public.prezzi_deposito_gamma p WHERE p.listino<>10 OR NOT EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice=p.deposito_codice AND d.store_id='c434096f-3bf0-45ce-ab7e-e631992fe13a')), 'Cambiago: only own depot prices';
  ASSERT (SELECT md5(string_agg(to_jsonb(l)::text,',' ORDER BY to_jsonb(l)::text)) = '32d3ccca83874aeb933f2db6b22c9cba' FROM public.listini_articolo_visibili('ITA1000108') l), 'Cambiago: unchanged article price detail';
  ASSERT (SELECT md5(string_agg(to_jsonb(c)::text,',' ORDER BY codice)) = '08639de592db9ee52fe71542c43d2e59' FROM public.cerca_articoli(testo=>'ITA1000108') c), 'Cambiago: unchanged search';
  ASSERT (SELECT prezzo=4.80 AND fonte_prezzo='deposito' FROM public.cerca_articoli(testo=>'ITA1000108')), 'Cambiago: 4.80 depot price';
END;
$test$;
SET LOCAL request.jwt.claims = '{"sub":"fb7214e8-6774-44f7-98ba-d744255cb027","role":"authenticated","aal":"aal2"}';
DO $test$
BEGIN
  ASSERT (SELECT array_agg(DISTINCT listino) = ARRAY[30]::smallint[] FROM public.articoli_gamma_listini), 'Cinisello: only list 30';
END;
$test$;
ROLLBACK;