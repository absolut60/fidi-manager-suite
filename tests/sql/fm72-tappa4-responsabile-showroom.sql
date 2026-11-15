-- FM72 ④a: prove reali con RLS, claims aal2 e fixture annullate.
BEGIN;
DO $test$
DECLARE
  u uuid := 'f0720400-0000-4000-8000-000000000001';
  admin uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  sede1 uuid := '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221';
  sede2 uuid := 'dd51b549-e15a-4d3a-bac4-38d28967c651';
  l1 uuid := 'f0720400-0000-4000-8000-000000000011';
  l2 uuid := 'f0720400-0000-4000-8000-000000000012';
  cliente uuid; cliente2 uuid; documento uuid; n integer; negato boolean;
  claims_u text; claims_admin text;
BEGIN
  IF (SELECT count(*) FROM public.preventivi) <> 5 THEN
    RAISE EXCEPTION 'Dati di partenza cambiati: attesi 5 preventivi';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'Fixture già esistente'; END IF;
  claims_u := json_build_object('sub',u,'role','authenticated','aal','aal2')::text;
  claims_admin := json_build_object('sub',admin,'role','authenticated','aal','aal2')::text;
  PERFORM set_config('request.jwt.claims', claims_admin, true);
  INSERT INTO auth.users(id,email,aud,role) VALUES(u,'fm72-tappa4@fixture.invalid','authenticated','authenticated');
  INSERT INTO public.profili(id,email,nome,cognome) VALUES(u,'fm72-tappa4@fixture.invalid','Fixture','FM72') ON CONFLICT(id) DO NOTHING;
  UPDATE public.profili SET store_id=NULL, linee_abilitate='{showroom}',linea_predefinita='showroom' WHERE id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'responsabile_showroom');
  INSERT INTO public.lead(id,ragione_sociale,store_id,created_by) VALUES
    (l1,'FM72 fixture prima sede',sede1,admin),(l2,'FM72 fixture seconda sede',sede2,admin);
  SELECT id INTO cliente FROM public.clienti WHERE store_id=sede1 LIMIT 1;
  SELECT id INTO cliente2 FROM public.clienti WHERE store_id=sede2 LIMIT 1;
  IF cliente IS NULL OR cliente2 IS NULL THEN RAISE EXCEPTION 'Clienti di due sedi necessari'; END IF;

  PERFORM set_config('request.jwt.claims',claims_u,true);
  SET LOCAL ROLE authenticated;
  IF NOT public.auth_e_showroom() OR NOT public.auth_solo_showroom() OR NOT public.auth_consulta_preventivi()
    OR NOT public.auth_ha_ruolo_globale_clienti() OR NOT public.showroom_sede_ok(NULL)
  THEN RAISE EXCEPTION 'Eredità showroom o perimetro globale errati'; END IF;
  SELECT count(*) INTO n FROM public.lead WHERE id IN(l1,l2);
  IF n<>2 THEN RAISE EXCEPTION 'Responsabile: attesi due lead, visti %',n; END IF;
  IF NOT public.auth_puo_vedere_lead(l1) OR NOT public.auth_puo_vedere_lead(l2)
    OR NOT public.auth_puo_modificare_lead(l1) OR NOT public.auth_puo_modificare_lead(l2)
    OR NOT public.showroom_lead_della_sede(l2) OR NOT public.showroom_cliente_della_sede(cliente2)
    OR public.showroom_lead_della_sede('f0720400-0000-4000-8000-000000000099')
  THEN RAISE EXCEPTION 'Helper lead/clienti errati'; END IF;
  UPDATE public.lead SET ragione_sociale=ragione_sociale||' modificato' WHERE id IN(l1,l2);
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'Modifica lead di due sedi negata'; END IF;
  -- Include la restrittiva INSERT: nessuna sede richiesta nel profilo.
  INSERT INTO public.lead(ragione_sociale,store_id,created_by) VALUES('FM72 fixture inserimento',sede2,u);
  SELECT count(*) INTO n FROM public.clienti WHERE store_id=sede1;
  IF n<=0 THEN RAISE EXCEPTION 'Clienti prima sede non visibili'; END IF;
  SELECT count(*) INTO n FROM public.clienti WHERE store_id=sede2;
  IF n<=0 THEN RAISE EXCEPTION 'Clienti seconda sede non visibili'; END IF;
  SELECT count(*) INTO n FROM public.preventivi;
  IF n<>0 THEN RAISE EXCEPTION 'Linea showroom: attesi zero preventivi, visti %',n; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',claims_admin,true);
  UPDATE public.profili SET linee_abilitate='{sistema_made}' WHERE id=u;
  PERFORM set_config('request.jwt.claims',claims_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  IF n<>5 THEN RAISE EXCEPTION 'Linea Sistema MADE: attesi 5, visti %',n; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',claims_admin,true);
  UPDATE public.profili SET linee_abilitate='{showroom}' WHERE id=u;
  PERFORM set_config('request.jwt.claims',claims_u,true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.preventivi(numero,titolo,linea) VALUES('FM72-T4-'||gen_random_uuid(),'FM72 fixture consentita','showroom') RETURNING id INTO documento;
  RESET ROLE;
  -- Rollback locale del documento consentito per conservare i conteggi reali di non regressione.
  DELETE FROM public.preventivi WHERE id=documento;
  negato:=false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.preventivi(numero,titolo,linea) VALUES('FM72-T4-'||gen_random_uuid(),'FM72 fixture negata','sistema_made');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN negato:=true; RESET ROLE;
  END;
  IF NOT negato THEN RAISE EXCEPTION 'INSERT linea non abilitata consentito'; END IF;
  negato:=false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.richieste_fido(cliente_id,importo_richiesto) VALUES(cliente,1000);
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN negato:=true; RESET ROLE;
  END;
  IF NOT negato THEN RAISE EXCEPTION 'INSERT richieste fido consentito'; END IF;
  SET LOCAL ROLE authenticated;
  UPDATE public.clienti SET ragione_sociale=ragione_sociale||' FM72 vietato' WHERE id=cliente;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'UPDATE clienti consentito'; END IF;
  RESET ROLE;

  -- Showroom ordinario: sede invariata, helper e RLS coerenti.
  DELETE FROM public.user_roles WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'showroom');
  PERFORM set_config('request.jwt.claims',claims_admin,true);
  UPDATE public.profili SET store_id=sede1,linee_abilitate='{sistema_made}',linea_predefinita='sistema_made' WHERE id=u;
  PERFORM set_config('request.jwt.claims',claims_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.lead WHERE id IN(l1,l2);
  IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.lead WHERE id=l1) THEN RAISE EXCEPTION 'Showroom vede lead fuori sede'; END IF;
  IF public.auth_puo_vedere_lead(l2) OR public.auth_puo_modificare_lead(l2) OR public.showroom_sede_ok(sede2) THEN RAISE EXCEPTION 'Helper showroom fuori sede'; END IF;
  UPDATE public.lead SET ragione_sociale=ragione_sociale||' vietato' WHERE id=l2;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Showroom modifica lead fuori sede'; END IF;
  RESET ROLE;
  DELETE FROM public.user_roles WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'store_manager');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  IF n<>3 THEN RAISE EXCEPTION 'Store manager Cinisello: attesi 3, visti %',n; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',claims_admin,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  IF n<>5 THEN RAISE EXCEPTION 'Amministratore: attesi 5, visti %',n; END IF;
  RESET ROLE;
  RAISE NOTICE 'FM72 ④a: tutti i casi superati';
END;
$test$;
ROLLBACK;