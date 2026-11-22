-- SOLO clone locale vuoto: base FM96 + gate/vecchia RPC reali + migrazione 0272.
-- Tutte le fixture vengono annullate. Nessun dato del progetto.
BEGIN;
GRANT SELECT ON public.lead, public.preventivi TO authenticated;
CREATE FUNCTION pg_temp.verifica(ok boolean, motivo text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FM97 FAIL: %', motivo; END IF; RAISE NOTICE 'FM97 PASS: %', motivo; END $$;
CREATE FUNCTION pg_temp.rifiuta(o uuid, atteso text, dati jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$
DECLARE errore text;
BEGIN
  BEGIN PERFORM public.completa_dati_lead_esportazione_gamma(o,20::smallint,'01','02','ABC1234',dati);
  EXCEPTION WHEN OTHERS THEN errore := SQLERRM; END;
  PERFORM pg_temp.verifica(errore LIKE '%'||atteso||'%',atteso);
END $$;
INSERT INTO public.lead(id,ragione_sociale,indirizzo,cap,citta,provincia,email,telefono,cellulare,partita_iva,codice_fiscale,tipo_soggetto,note)
VALUES('97000000-0000-0000-0000-000000000011','Originale',NULL,'20900',NULL,'MB','prima@example.test','123','456','01234567890','CF_ORIG','azienda','Non modificare'),
      ('97000000-0000-0000-0000-000000000012','Altro lead','Altro indirizzo','00100','Roma','RM','altro@example.test','999','888','09876543210','ALTRO','azienda','Altra nota');
INSERT INTO public.preventivi(id,numero,tipo,lead_id,esportato_gamma_at,listino_rif,macrocategoria_rif,categoria_rif)
VALUES ('97000000-0000-0000-0000-000000000001','ORD-PROVA','ordine','97000000-0000-0000-0000-000000000011',NULL,10,'A','B'),
 ('97000000-0000-0000-0000-000000000002','ORD-EX','ordine','97000000-0000-0000-0000-000000000011',now(),10,'A','B'),
 ('97000000-0000-0000-0000-000000000003','PREV','preventivo','97000000-0000-0000-0000-000000000011',NULL,10,'A','B'),
 ('97000000-0000-0000-0000-000000000004','ORD-CLIENTE','ordine',NULL,NULL,10,'A','B'),
 ('97000000-0000-0000-0000-000000000005','NON-VISIBILE','ordine','97000000-0000-0000-0000-000000000012',NULL,10,'A','B');
INSERT INTO public.fm96_visibility SELECT id,'97000000-0000-0000-0000-000000000099'::uuid FROM public.preventivi WHERE id<>'97000000-0000-0000-0000-000000000005';
SELECT set_config('request.jwt.claims','{"sub":"97000000-0000-0000-0000-000000000099","role":"authenticated","aal":"aal2"}',true);
DO $$ DECLARE r public.app_role;
BEGIN
  FOR r IN SELECT unnest(enum_range(NULL::public.app_role)) LOOP
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles(user_id,role) VALUES('97000000-0000-0000-0000-000000000099',r);
    IF r IN ('amministratore','responsabile_showroom') THEN
      PERFORM public.completa_dati_lead_esportazione_gamma('97000000-0000-0000-0000-000000000001',NULL,NULL,NULL,NULL,NULL);
      PERFORM pg_temp.verifica(true,'ruolo ammesso '||r);
    ELSE PERFORM pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','non autorizzata'); END IF;
  END LOOP;
END $$;
DELETE FROM public.user_roles;
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','non autorizzata');
INSERT INTO public.user_roles(user_id,role) VALUES('97000000-0000-0000-0000-000000000099','amministratore');
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifica(NOT has_function_privilege('anon','public.completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb)','EXECUTE'),'anon senza EXECUTE');
SELECT pg_temp.verifica(has_function_privilege('authenticated','public.completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb)','EXECUTE'),'authenticated EXECUTE');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000002','già esportato');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000003','solo ordini a lead');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000004','solo ordini a lead');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000005','non visibile');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','Campo anagrafico non ammesso','{"note":"NON AMMESSO"}');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','Campo anagrafico non ammesso','{"email":123}');
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','Dati anagrafici non validi','[]');
SELECT pg_temp.verifica((SELECT listino_rif=10 AND macrocategoria_rif='A' AND categoria_rif='B' FROM public.preventivi WHERE id='97000000-0000-0000-0000-000000000001'),'errore annulla anche aggiornamento ordine');
SELECT pg_temp.verifica((SELECT codice_sdi IS NULL FROM public.lead WHERE id='97000000-0000-0000-0000-000000000011'),'errore annulla anche SDI');
SELECT public.completa_dati_lead_esportazione_gamma('97000000-0000-0000-0000-000000000001',20::smallint,' 01 ',' 02 ',' ABC1234 ',
 '{"indirizzo":" Via Roma 5 ","cap":null,"citta":" Monza ","provincia":null,"ragione_sociale":null,"nome":" Andrea ","cognome":" Giani ","partita_iva":" 12345678901 ","codice_fiscale":" abc123 ","telefono":" 321 ","cellulare":" 654 ","email":" nuova@example.test ","tipo_soggetto":" persona_fisica "}');
SELECT pg_temp.verifica((SELECT indirizzo='Via Roma 5' AND cap='20900' AND citta='Monza' AND provincia='MB' AND ragione_sociale='Originale' FROM public.lead WHERE id='97000000-0000-0000-0000-000000000011'),'indirizzo compilato e NULL invariato');
SELECT pg_temp.verifica((SELECT nome='Andrea' AND cognome='Giani' AND partita_iva='12345678901' AND codice_fiscale='abc123' AND telefono='321' AND cellulare='654' AND email='nuova@example.test' AND tipo_soggetto='persona_fisica' AND codice_sdi='ABC1234' AND note='Non modificare' FROM public.lead WHERE id='97000000-0000-0000-0000-000000000011'),'solo colonne ammesse normalizzate');
SELECT pg_temp.verifica((SELECT ragione_sociale='Altro lead' AND indirizzo='Altro indirizzo' AND codice_sdi IS NULL FROM public.lead WHERE id='97000000-0000-0000-0000-000000000012'),'solo lead collegato aggiornato');
SELECT pg_temp.verifica((SELECT listino_rif=20 AND macrocategoria_rif='01' AND categoria_rif='02' FROM public.preventivi WHERE id='97000000-0000-0000-0000-000000000001'),'riferimenti salvati su ordine');
SELECT pg_temp.verifica((SELECT listino_rif IS NULL AND macrocategoria_rif IS NULL AND categoria_rif IS NULL FROM public.lead WHERE id='97000000-0000-0000-0000-000000000011'),'riferimenti non copiati sul lead');
SELECT public.completa_dati_lead_esportazione_gamma('97000000-0000-0000-0000-000000000001',NULL,NULL,NULL,'','{"indirizzo":"  ","email":"","ragione_sociale":"","nome":null}');
SELECT pg_temp.verifica((SELECT indirizzo IS NULL AND email IS NULL AND ragione_sociale IS NULL AND codice_sdi IS NULL AND nome='Andrea' FROM public.lead WHERE id='97000000-0000-0000-0000-000000000011'),'vuoto -> NULL, JSON NULL invariato');
SELECT pg_temp.verifica((SELECT listino_rif=20 AND macrocategoria_rif='01' AND categoria_rif='02' FROM public.preventivi WHERE id='97000000-0000-0000-0000-000000000001'),'riferimenti NULL invariati');
SELECT set_config('request.jwt.claims','{"sub":"97000000-0000-0000-0000-000000000099","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.rifiuta('97000000-0000-0000-0000-000000000001','non autorizzata');
RESET ROLE;
ROLLBACK;