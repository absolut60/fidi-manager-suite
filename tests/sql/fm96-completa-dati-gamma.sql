-- SOLO clone isolato: clone-base, 0266, 0267, 0268, 0269; nessun dato dell'app.
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
INSERT INTO public.lead(id,ragione_sociale) VALUES ('40000000-0000-0000-0000-000000000001','FM96 SOLO CLONE');
INSERT INTO public.preventivi(id,tipo,numero,lead_id,esportato_gamma_at) VALUES
('20000000-0000-0000-0000-000000000001','ordine','FM96-LEAD','40000000-0000-0000-0000-000000000001',NULL),
('20000000-0000-0000-0000-000000000002','ordine','FM96-ESPORTATO','40000000-0000-0000-0000-000000000001',now()),
('20000000-0000-0000-0000-000000000003','ordine','FM96-CLIENTE',NULL,NULL),
('20000000-0000-0000-0000-000000000004','preventivo','FM96-PREVENTIVO','40000000-0000-0000-0000-000000000001',NULL),
('20000000-0000-0000-0000-000000000005','ordine','FM96-NASCOSTO','40000000-0000-0000-0000-000000000001',NULL);
INSERT INTO public.fm96_visibility SELECT p.id,u.user_id FROM public.preventivi p CROSS JOIN public.user_roles u WHERE p.numero <> 'FM96-NASCOSTO';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','ABC1234');
SELECT pg_temp.verifica((SELECT listino_rif=20 AND macrocategoria_rif='01' AND categoria_rif='02' FROM public.preventivi WHERE numero='FM96-LEAD'), 'amministratore salva ordine');
SELECT pg_temp.verifica((SELECT codice_sdi='ABC1234' AND listino_rif IS NULL FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'solo SDI sul lead');
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',NULL,NULL,NULL,NULL);
SELECT pg_temp.verifica((SELECT listino_rif=20 AND macrocategoria_rif='01' AND categoria_rif='02' FROM public.preventivi WHERE numero='FM96-LEAD'), 'NULL riferimenti lascia invariato');
SELECT pg_temp.verifica((SELECT codice_sdi='ABC1234' FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'NULL SDI lascia invariato');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',10::smallint,'03','04','DEF5678');
SELECT pg_temp.verifica((SELECT listino_rif=10 AND macrocategoria_rif='03' AND categoria_rif='04' FROM public.preventivi WHERE numero='FM96-LEAD'), 'responsabile showroom salva');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000002',20::smallint,'01','02','ABC1234')$q$, 'Ordine già esportato');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000003',20::smallint,'01','02','ABC1234')$q$, 'solo ordini a lead');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000004',20::smallint,'01','02','ABC1234')$q$, 'solo ordini a lead');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000005',20::smallint,'01','02','ABC1234')$q$, 'Ordine non visibile');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','abc1234')$q$, 'Codice SDI non valido');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','AB C123')$q$, 'Codice SDI non valido');
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','ABCDEFGH')$q$, 'Codice SDI non valido');
SELECT pg_temp.verifica((SELECT listino_rif=10 FROM public.preventivi WHERE numero='FM96-LEAD'), 'errore SDI nessuna scrittura ordine');
SELECT pg_temp.verifica((SELECT codice_sdi='DEF5678' FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'errore SDI nessuna scrittura lead');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','ABC1234')$q$, 'non autorizzata');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','ABC1234')$q$, 'non autorizzata');
RESET ROLE;
INSERT INTO auth.mfa_factors(user_id,status) VALUES ('00000000-0000-0000-0000-000000000001','verified');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiutato($q$SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',20::smallint,'01','02','ABC1234')$q$, 'non autorizzata');
RESET ROLE;
SELECT pg_temp.verifica(NOT has_function_privilege('anon','public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text)','execute'), 'anon senza EXECUTE');
SELECT pg_temp.verifica(has_function_privilege('authenticated','public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text)','execute'), 'authenticated con EXECUTE');
ROLLBACK;