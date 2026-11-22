-- SOLO clone isolato: base + 0266-0270. Nessun dato reale. Tutto annullato.
BEGIN;
CREATE FUNCTION pg_temp.verifica(ok boolean, descrizione text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', descrizione; END IF; RAISE NOTICE 'PASS: %', descrizione; END $$;
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-000000000001','amministratore');
INSERT INTO public.lead(id,ragione_sociale,codice_sdi) VALUES ('40000000-0000-0000-0000-000000000001','SOLO CLONE SDI','ABC1234');
INSERT INTO public.preventivi(id,tipo,numero,lead_id,listino_rif) VALUES ('20000000-0000-0000-0000-000000000001','ordine','SOLO CLONE SDI','40000000-0000-0000-0000-000000000001',20);
INSERT INTO public.fm96_visibility VALUES ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',NULL,NULL,NULL,'');
SELECT pg_temp.verifica((SELECT codice_sdi IS NULL FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'SDI vuoto salva NULL');
SELECT pg_temp.verifica((SELECT listino_rif=20 FROM public.preventivi WHERE numero='SOLO CLONE SDI'), 'nessun altro dato modificato');
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',NULL,NULL,NULL,'XYZ1234');
SELECT pg_temp.verifica((SELECT codice_sdi='XYZ1234' FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'SDI valido invariato');
SELECT public.completa_dati_esportazione_gamma('20000000-0000-0000-0000-000000000001',NULL,NULL,NULL,NULL);
SELECT pg_temp.verifica((SELECT codice_sdi='XYZ1234' FROM public.lead WHERE id='40000000-0000-0000-0000-000000000001'), 'NULL parametro lascia invariato');
ROLLBACK;
