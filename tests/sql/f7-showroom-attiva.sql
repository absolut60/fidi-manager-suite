-- F7: con la linea Showroom attiva, visibilità/scrittura per sede ∩ linea reggono anche su documenti showroom reali.
-- Fixture (utente + 2 preventivi showroom) dentro la transazione; l'eccezione finale annulla tutto.
DO $test$
DECLARE
  u uuid := 'f0f70000-0000-4000-8000-000000000001';
  admin uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  cinisello uuid := '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221';
  lissone uuid := 'dd51b549-e15a-4d3a-bac4-38d28967c651';
  c_u text := json_build_object('sub','f0f70000-0000-4000-8000-000000000001','role','authenticated','aal','aal2')::text;
  c_admin text := json_build_object('sub','30c9d579-76c3-4312-b47e-3f9f4680fc40','role','authenticated','aal','aal2')::text;
  p_lis uuid; p_cin uuid; n integer; negato boolean; agente text;
BEGIN
  SELECT codice INTO agente FROM public.agenti LIMIT 1;
  INSERT INTO public.preventivi(numero,titolo,linea,store_id) VALUES('F7-'||gen_random_uuid(),'F7 showroom Lissone','showroom',lissone) RETURNING id INTO p_lis;
  INSERT INTO public.preventivi(numero,titolo,linea,store_id) VALUES('F7-'||gen_random_uuid(),'F7 showroom Cinisello','showroom',cinisello) RETURNING id INTO p_cin;
  INSERT INTO auth.users(id,email,aud,role) VALUES(u,'f7@fixture.invalid','authenticated','authenticated');
  INSERT INTO public.profili(id,email,nome,cognome) VALUES(u,'f7@fixture.invalid','Fixture','F7') ON CONFLICT(id) DO NOTHING;

  -- 1. showroom, sede Lissone, linee {showroom}: solo lo showroom di Lissone.
  PERFORM set_config('request.jwt.claims',c_admin,true);
  UPDATE public.profili SET store_id=lissone, linee_abilitate='{showroom}', linea_predefinita='showroom' WHERE id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'showroom');
  PERFORM set_config('request.jwt.claims',c_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi; 
  IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.preventivi WHERE id=p_lis) THEN RESET ROLE; RAISE EXCEPTION 'KO1 showroom Lissone {showroom}: visti %',n; END IF;
  -- Il ruolo showroom semplice consulta soltanto (auth_puo_scrivere_preventivo non lo include).
  IF public.auth_puo_scrivere_preventivo_id(p_lis) OR public.auth_puo_scrivere_preventivo_id(p_cin) THEN RESET ROLE; RAISE EXCEPTION 'KO1 showroom semplice scrive'; END IF;
  RESET ROLE;
  -- scrittura fuori sede negata anche come UPDATE diretto
  SET LOCAL ROLE authenticated;
  UPDATE public.preventivi SET titolo=titolo||'x' WHERE id=p_cin; GET DIAGNOSTICS n=ROW_COUNT;
  RESET ROLE;
  IF n<>0 THEN RAISE EXCEPTION 'KO1 UPDATE fuori sede accettato'; END IF;

  -- 2. stesso utente con linee {sistema_made}: nessun showroom, vede il solo sistema_made di Lissone.
  PERFORM set_config('request.jwt.claims',c_admin,true);
  UPDATE public.profili SET linee_abilitate='{sistema_made}', linea_predefinita='sistema_made' WHERE id=u;
  PERFORM set_config('request.jwt.claims',c_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi WHERE linea='showroom';
  RESET ROLE;
  IF n<>0 THEN RAISE EXCEPTION 'KO2 showroom con linea non abilitata: visti %',n; END IF;

  -- 3. store manager Lissone: tutte le linee della propria sede (1 sistema_made + 1 showroom).
  DELETE FROM public.user_roles WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'store_manager');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  RESET ROLE;
  IF n<>2 THEN RAISE EXCEPTION 'KO3 store manager Lissone: attesi 2, visti %',n; END IF;

  -- 4. preventivista {sistema_made}: non vede lo showroom e non può crearlo (blocco a DB).
  DELETE FROM public.user_roles WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'preventivi_write');
  PERFORM set_config('request.jwt.claims',c_admin,true);
  UPDATE public.profili SET codice_agente=agente WHERE id=u;
  PERFORM set_config('request.jwt.claims',c_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi WHERE linea='showroom';
  RESET ROLE;
  IF n<>0 THEN RAISE EXCEPTION 'KO4 preventivista vede showroom: %',n; END IF;
  negato:=false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.preventivi(numero,titolo,agente_codice,linea) VALUES('F7-'||gen_random_uuid(),'F7 negato',agente,'showroom');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN negato:=true; RESET ROLE;
  END;
  IF NOT negato THEN RAISE EXCEPTION 'KO4 INSERT showroom con linea non abilitata accettato'; END IF;
  -- con {showroom}: vede i 2 showroom e il cambio linea verso sistema_made è negato
  PERFORM set_config('request.jwt.claims',c_admin,true);
  UPDATE public.profili SET linee_abilitate='{showroom}', linea_predefinita='showroom' WHERE id=u;
  PERFORM set_config('request.jwt.claims',c_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  RESET ROLE;
  IF n<>2 THEN RAISE EXCEPTION 'KO4 preventivista {showroom}: attesi 2, visti %',n; END IF;
  negato:=false;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET linea='sistema_made' WHERE id=p_lis;
    GET DIAGNOSTICS n=ROW_COUNT;
    RESET ROLE;
    IF n=0 THEN negato:=true; END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN negato:=true; RESET ROLE;
  END;
  IF NOT negato THEN RAISE EXCEPTION 'KO4 cambio linea verso non abilitata accettato'; END IF;

  -- 5. responsabile_showroom {showroom}, senza sede: entrambe le sedi showroom, nessun sistema_made.
  DELETE FROM public.user_roles WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'responsabile_showroom');
  PERFORM set_config('request.jwt.claims',c_admin,true);
  UPDATE public.profili SET store_id=NULL WHERE id=u;
  PERFORM set_config('request.jwt.claims',c_u,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.preventivi;
  RESET ROLE;
  IF n<>2 THEN RAISE EXCEPTION 'KO5 responsabile showroom: attesi 2, visti %',n; END IF;
  SET LOCAL ROLE authenticated;
  IF NOT public.auth_puo_scrivere_preventivo_id(p_lis) OR NOT public.auth_puo_scrivere_preventivo_id(p_cin) THEN RESET ROLE; RAISE EXCEPTION 'KO5 responsabile non scrive showroom'; END IF;
  RESET ROLE;

  RAISE EXCEPTION 'F7_OK: tutti i casi superati (rollback)';
END;
$test$;
