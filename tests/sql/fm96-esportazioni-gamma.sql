-- Eseguire sul clone isolato con schema reale e funzioni 0266, mai con COMMIT.
-- auth_vede_preventivo_id usa una matrice esplicita nel clone: non simula la RLS degli acquisti.
BEGIN;
CREATE FUNCTION pg_temp.verifica(ok boolean, descrizione text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', descrizione; END IF; RAISE NOTICE 'PASS: %', descrizione; END $$;
CREATE FUNCTION pg_temp.rifiutato(comando text, messaggio text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE comando;
  EXCEPTION WHEN OTHERS THEN
    IF position(messaggio IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Errore inatteso: %', SQLERRM; END IF;
    RAISE NOTICE 'PASS rifiuto: %', messaggio; RETURN;
  END;
  RAISE EXCEPTION 'FAIL: comando ammesso: %', comando;
END $$;

INSERT INTO public.user_roles(user_id,role) VALUES
('00000000-0000-0000-0000-000000000001','amministratore'),
('00000000-0000-0000-0000-000000000002','responsabile_showroom'),
('00000000-0000-0000-0000-000000000003','store_manager'),
('00000000-0000-0000-0000-000000000004','showroom');
INSERT INTO public.stores(id,nome,listino_riferimento) VALUES
('10000000-0000-0000-0000-000000000010','FM96 Lissone',10),
('10000000-0000-0000-0000-000000000020','FM96 Pianezza',20);
INSERT INTO public.profili(id,store_id,attivo) VALUES
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000010',true);
INSERT INTO public.lead(id,ragione_sociale) VALUES ('40000000-0000-0000-0000-000000000001','FM96 SOLO ROLLBACK');
INSERT INTO public.preventivi(id,tipo,numero,store_id,lead_id) VALUES
('20000000-0000-0000-0000-000000000001','ordine','FM96-ORD-1','10000000-0000-0000-0000-000000000020','40000000-0000-0000-0000-000000000001'),
('20000000-0000-0000-0000-000000000002','ordine','FM96-ORD-2','10000000-0000-0000-0000-000000000020',NULL),
('20000000-0000-0000-0000-000000000003','preventivo','FM96-PRV-3','10000000-0000-0000-0000-000000000020',NULL),
('20000000-0000-0000-0000-000000000004','ordine','FM96-ORD-NASCOSTO','10000000-0000-0000-0000-000000000020',NULL);
INSERT INTO public.fm96_visibility SELECT p.id, u.user_id FROM public.preventivi p CROSS JOIN public.user_roles u WHERE p.numero <> 'FM96-ORD-NASCOSTO';
INSERT INTO public.blocchi_preventivo(id,preventivo_id) VALUES
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003'),
('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004');
INSERT INTO public.righe_preventivo(id,blocco_id,articolo_codice,quantita) VALUES
('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','FM96-A',10),
('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','FM96-P',10),
('50000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','FM96-N',10);
INSERT INTO public.articoli_gamma_listini(articolo_codice,listino,acq_prezzo) VALUES
('FM96-A',10,10),('FM96-A',20,20),('FM96-A',9,9),('FM96-P',20,30),('FM96-N',20,40),('FM96-ESTRANEO',20,50);
ALTER TABLE public.articoli_gamma_listini ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm96_listini_sede ON public.articoli_gamma_listini FOR SELECT TO authenticated
USING (listino <> 9 AND EXISTS (SELECT 1 FROM public.auth_listini_sede() s WHERE s.globale OR s.listino=articoli_gamma_listini.listino));
GRANT SELECT,UPDATE,INSERT,DELETE ON ALL TABLES IN SCHEMA public TO service_role;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.verifica(public.auth_puo_esportare_gamma(), 'responsabile showroom autorizzato');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.articoli_gamma_listini WHERE listino=20), 'Lissone non legge direttamente il listino 20');
SELECT pg_temp.verifica((SELECT count(*)=2 AND max(acq_prezzo)=20 FROM public.acquisti_gamma_ordini(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])), 'RPC legge listino 20 Pianezza e 10, non 9');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.acquisti_gamma_ordini(ARRAY['20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004']::uuid[])), 'RPC non legge preventivi, ordini nascosti o articoli estranei');

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.verifica(NOT public.auth_puo_esportare_gamma(), 'amministratore senza MFA rifiutato');
SELECT pg_temp.rifiutato($q$SELECT public.acquisti_gamma_ordini(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])$q$,'non autorizzata');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SELECT pg_temp.verifica(public.auth_puo_esportare_gamma(), 'amministratore con MFA autorizzato');
SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001']::uuid[],'FM96.xls','test/FM96.xls',2,1);
SELECT pg_temp.verifica((SELECT count(*)=1 AND max(n_ordini)=1 FROM public.esportazioni_gamma), 'registrazione atomica e ID duplicati normalizzati');
SELECT pg_temp.verifica((SELECT count(*)=1 FROM public.esportazioni_gamma_eventi WHERE tipo='esportato'), 'un evento esportato per ordine');
SELECT pg_temp.verifica(COALESCE(current_setting('app.gamma_scrittura',true),'')='', 'flag RPC ripristinato');
SELECT pg_temp.rifiutato($q$SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002']::uuid[],'fallita.xls','test/fallita.xls',1,1)$q$,'FM96-ORD-1: già esportato');
SELECT pg_temp.verifica((SELECT count(*)=1 FROM public.esportazioni_gamma) AND (SELECT esportato_gamma_at IS NULL FROM public.preventivi WHERE numero='FM96-ORD-2'), 'nessuna scrittura parziale con un ordine già esportato');
SELECT pg_temp.rifiutato($q$SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003']::uuid[],'fallita.xls','test/fallita.xls',1,1)$q$,'FM96-PRV-3: non è un ordine');
SELECT pg_temp.rifiutato($q$UPDATE public.righe_preventivo SET quantita=11 WHERE id='50000000-0000-0000-0000-000000000001'$q$,'Ordine già esportato in Gamma: riaprilo per modificarlo');
SELECT pg_temp.rifiutato($q$DELETE FROM public.righe_preventivo WHERE id='50000000-0000-0000-0000-000000000001'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$INSERT INTO public.righe_preventivo(blocco_id) VALUES('30000000-0000-0000-0000-000000000001')$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$UPDATE public.blocchi_preventivo SET descrizione='cambiata' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$DELETE FROM public.blocchi_preventivo WHERE id='30000000-0000-0000-0000-000000000001'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$INSERT INTO public.blocchi_preventivo(preventivo_id) VALUES('20000000-0000-0000-0000-000000000001')$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$UPDATE public.preventivi SET titolo='cambiato' WHERE numero='FM96-ORD-1'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$DELETE FROM public.preventivi WHERE numero='FM96-ORD-1'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$UPDATE public.righe_preventivo SET blocco_id='30000000-0000-0000-0000-000000000001' WHERE id='50000000-0000-0000-0000-000000000002'$q$,'Ordine già esportato');
SELECT pg_temp.rifiutato($q$UPDATE public.blocchi_preventivo SET preventivo_id='20000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'Ordine già esportato');
UPDATE public.righe_preventivo SET quantita=12 WHERE id='50000000-0000-0000-0000-000000000002';
SELECT pg_temp.verifica((SELECT quantita=12 FROM public.righe_preventivo WHERE id='50000000-0000-0000-0000-000000000002'), 'preventivo normale invariato');
UPDATE public.preventivi SET updated_at=now() WHERE numero='FM96-ORD-1';
UPDATE public.lead SET cliente_id='60000000-0000-0000-0000-000000000001' WHERE id='40000000-0000-0000-0000-000000000001';
SELECT pg_temp.verifica((SELECT cliente_id='60000000-0000-0000-0000-000000000001' AND lead_id IS NULL AND lead_origine_id='40000000-0000-0000-0000-000000000001' AND esportato_gamma_at IS NOT NULL FROM public.preventivi WHERE numero='FM96-ORD-1'), 'riaggancio lead ammesso senza riaprire');
SELECT pg_temp.rifiutato($q$INSERT INTO public.esportazioni_gamma(creata_da,nome_file,file_path,n_ordini,n_documenti_fornitore,n_documenti_cliente) VALUES(auth.uid(),'x','x',1,1,1)$q$,'permission denied');

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiutato($q$SELECT public.acquisti_gamma_ordini(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])$q$,'non autorizzata');
SELECT pg_temp.rifiutato($q$SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[],'x','x',1,1)$q$,'non autorizzata');
SELECT pg_temp.rifiutato($q$SELECT public.riapri_ordine_gamma('20000000-0000-0000-0000-000000000001')$q$,'non autorizzata');
SELECT pg_temp.rifiutato($q$UPDATE public.preventivi SET esportato_gamma_at=NULL,esportato_gamma_da=NULL,esportazione_gamma_id=NULL WHERE numero='FM96-ORD-1'$q$,'Ordine già esportato');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiutato($q$SELECT public.acquisti_gamma_ordini(ARRAY['20000000-0000-0000-0000-000000000001']::uuid[])$q$,'non autorizzata');
SELECT pg_temp.rifiutato($q$SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[],'x','x',1,1)$q$,'non autorizzata');
SELECT pg_temp.rifiutato($q$SELECT public.riapri_ordine_gamma('20000000-0000-0000-0000-000000000001')$q$,'non autorizzata');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.esportazioni_gamma), 'storico invisibile a showroom');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
SELECT public.registra_esportazione_gamma(ARRAY['20000000-0000-0000-0000-000000000002']::uuid[],'seconda.xls','test/seconda.xls',1,1);
SELECT public.riapri_ordine_gamma('20000000-0000-0000-0000-000000000001','Correzione quantità');
SELECT pg_temp.verifica((SELECT esportato_gamma_at IS NULL AND esportato_gamma_da IS NULL AND esportazione_gamma_id IS NULL FROM public.preventivi WHERE numero='FM96-ORD-1') AND (SELECT esportato_gamma_at IS NOT NULL FROM public.preventivi WHERE numero='FM96-ORD-2'), 'riapertura di un solo ordine');
UPDATE public.righe_preventivo SET quantita=11 WHERE id='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.verifica((SELECT quantita=11 FROM public.righe_preventivo WHERE id='50000000-0000-0000-0000-000000000001'), 'modifica dopo riapertura ammessa');
SELECT pg_temp.verifica((SELECT count(*)=2 FROM public.esportazioni_gamma) AND (SELECT count(*)=1 FROM public.esportazioni_gamma_eventi WHERE tipo='riaperto' AND motivo='Correzione quantità' AND esportazione_id IS NOT NULL), 'storico e riferimenti al file conservati');
INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
('esportazioni-gamma','test/da-pulire.xls',auth.uid()::text),
('esportazioni-gamma','test/seconda.xls',auth.uid()::text);
SELECT pg_temp.rifiutato($q$INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('esportazioni-gamma','test/proprietario-falso.xls','00000000-0000-0000-0000-000000000001')$q$,'row-level security');
DELETE FROM storage.objects WHERE name='test/seconda.xls';
SELECT pg_temp.verifica((SELECT count(*)=1 FROM storage.objects WHERE name='test/seconda.xls'), 'file registrato resta nello storico');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
DELETE FROM storage.objects WHERE name='test/da-pulire.xls';
SELECT pg_temp.verifica((SELECT count(*)=1 FROM storage.objects WHERE name='test/da-pulire.xls'), 'altro utente autorizzato non elimina file altrui');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
DELETE FROM storage.objects WHERE name='test/da-pulire.xls';
SELECT pg_temp.verifica((SELECT count(*)=0 FROM storage.objects WHERE name='test/da-pulire.xls'), 'proprietario ripulisce proprio file non registrato');
SELECT pg_temp.rifiutato($q$SELECT public.riapri_ordine_gamma('20000000-0000-0000-0000-000000000001')$q$,'non esportato');
SELECT pg_temp.rifiutato($q$UPDATE public.esportazioni_gamma SET nome_file='alterato'$q$,'permission denied');
SELECT pg_temp.rifiutato($q$DELETE FROM public.esportazioni_gamma_eventi$q$,'permission denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.preventivi SET titolo='servizio' WHERE numero='FM96-ORD-2';
INSERT INTO public.blocchi_preventivo(id,preventivo_id) VALUES ('30000000-0000-0000-0000-000000000099','20000000-0000-0000-0000-000000000002');
UPDATE public.blocchi_preventivo SET descrizione='servizio' WHERE id='30000000-0000-0000-0000-000000000099';
INSERT INTO public.righe_preventivo(blocco_id,quantita) VALUES ('30000000-0000-0000-0000-000000000099',1);
UPDATE public.righe_preventivo SET quantita=2 WHERE blocco_id='30000000-0000-0000-0000-000000000099';
DELETE FROM public.righe_preventivo WHERE blocco_id='30000000-0000-0000-0000-000000000099';
DELETE FROM public.blocchi_preventivo WHERE id='30000000-0000-0000-0000-000000000099';
SELECT pg_temp.verifica((SELECT titolo='servizio' FROM public.preventivi WHERE numero='FM96-ORD-2'), 'service_role esente sui tre livelli');
RESET ROLE;
ROLLBACK;