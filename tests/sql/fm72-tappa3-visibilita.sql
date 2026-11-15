-- FM72 tappa 3a: visibilità per sede/linea e scrittura per linea abilitata.
-- DB reale, BEGIN/ROLLBACK: utente fixture creato e annullato nella transazione, nessun account reale toccato.
-- Atteso con i dati di oggi: 5 preventivi, tutti sistema_made (Cinisello 3, Lissone 1, Casorezzo 1).
BEGIN;
DO $test$
DECLARE
  u uuid := 'f0720300-0000-4000-8000-000000000001';
  admin uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  cinisello uuid := '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221';
  lissone uuid := 'dd51b549-e15a-4d3a-bac4-38d28967c651';
  casorezzo uuid := 'f5d415b4-87c6-46fe-aba8-47896e3667d6';
  vuota uuid; agente text; n integer; p_mio uuid; p_altro uuid; ok boolean; rifiutato boolean;
BEGIN
  SELECT s.id INTO vuota FROM public.stores s
   WHERE NOT EXISTS (SELECT 1 FROM public.preventivi p WHERE p.store_id=s.id) LIMIT 1;
  SELECT codice_agente INTO agente FROM public.agenti LIMIT 1;
  IF (SELECT count(*) FROM public.preventivi) <> 5 THEN RAISE EXCEPTION 'Dati di partenza cambiati: aggiornare i conteggi attesi'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'UUID fixture già usato'; END IF;

  INSERT INTO auth.users(id, email, aud, role) VALUES (u, 'fm72-tappa3@fixture.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.profili(id, email, nome, cognome) VALUES (u, 'fm72-tappa3@fixture.invalid', 'Fixture', 'FM72')
    ON CONFLICT (id) DO NOTHING;
  IF (SELECT linee_abilitate FROM public.profili WHERE id=u) IS DISTINCT FROM '{sistema_made}'::public.linea_preventivo[]
    OR (SELECT linea_predefinita FROM public.profili WHERE id=u) IS DISTINCT FROM 'sistema_made'
  THEN RAISE EXCEPTION 'Default del profilo errati'; END IF;

  -- Amministratore
  PERFORM set_config('request.jwt.claims', json_build_object('sub',admin,'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 5 THEN RAISE EXCEPTION 'Amministratore: attesi 5, visti %', n; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','aal','aal2')::text, true);

  -- preventivi_read
  INSERT INTO public.user_roles(user_id, role) VALUES (u,'preventivi_read');
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 5 THEN RAISE EXCEPTION 'preventivi_read default: attesi 5, visti %', n; END IF;
  UPDATE public.profili SET linee_abilitate='{showroom}' WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'preventivi_read showroom: attesi 0, visti %', n; END IF;
  DELETE FROM public.user_roles WHERE user_id=u;
  UPDATE public.profili SET linee_abilitate='{sistema_made}' WHERE id=u;

  -- store_manager per sede
  INSERT INTO public.user_roles(user_id, role) VALUES (u,'store_manager');
  UPDATE public.profili SET store_id=cinisello WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'Store manager Cinisello: attesi 3, visti %', n; END IF;
  SELECT id INTO p_mio FROM public.preventivi WHERE store_id=cinisello LIMIT 1;
  SELECT id INTO p_altro FROM public.preventivi WHERE store_id=lissone LIMIT 1;
  SET LOCAL ROLE authenticated;
  IF NOT public.auth_vede_preventivo_id(p_mio) OR public.auth_vede_preventivo_id(p_altro) THEN
    RESET ROLE; RAISE EXCEPTION 'auth_vede_preventivo_id incoerente per lo store manager';
  END IF;
  RESET ROLE;
  UPDATE public.profili SET linee_abilitate='{showroom}' WHERE id=u; -- store manager: tutte le linee
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'Store manager: le linee non devono limitarlo (visti %)', n; END IF;
  UPDATE public.profili SET linee_abilitate='{sistema_made}', store_id=lissone WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'Store manager Lissone: attesi 1, visti %', n; END IF;
  UPDATE public.profili SET store_id=casorezzo WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'Store manager Casorezzo: attesi 1, visti %', n; END IF;
  UPDATE public.profili SET store_id=vuota WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'Store manager sede vuota: attesi 0, visti %', n; END IF;
  DELETE FROM public.user_roles WHERE user_id=u;

  -- showroom
  INSERT INTO public.user_roles(user_id, role) VALUES (u,'showroom');
  UPDATE public.profili SET store_id=cinisello WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'Showroom Cinisello default: attesi 3, visti %', n; END IF;
  UPDATE public.profili SET linee_abilitate='{showroom}' WHERE id=u;
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.preventivi; RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'Showroom Cinisello {showroom}: attesi 0, visti %', n; END IF;
  DELETE FROM public.user_roles WHERE user_id=u;

  -- scrittura preventivi_write
  INSERT INTO public.user_roles(user_id, role) VALUES (u,'preventivi_write');
  UPDATE public.profili SET codice_agente=agente, linee_abilitate='{showroom}' WHERE id=u;
  rifiutato := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.preventivi(numero, titolo, agente_codice, linea)
      VALUES ('FM72-T3-'||gen_random_uuid()::text, 'FM72 TEST linea non abilitata', agente, 'sistema_made');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN rifiutato := true; RESET ROLE;
  END;
  IF NOT rifiutato THEN RAISE EXCEPTION 'INSERT su linea non abilitata accettato'; END IF;
  UPDATE public.profili SET linee_abilitate='{sistema_made}' WHERE id=u;
  SET LOCAL ROLE authenticated;
  INSERT INTO public.preventivi(numero, titolo, agente_codice, linea)
    VALUES ('FM72-T3-'||gen_random_uuid()::text, 'FM72 TEST linea abilitata', agente, 'sistema_made');
  RESET ROLE;

  -- Nessuna funzione cita più le firme vecchie
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='auth_vede_preventivo' AND pronargs<>6)
    OR EXISTS (SELECT 1 FROM pg_proc WHERE proname='auth_puo_scrivere_preventivo' AND pronargs<>2)
  THEN RAISE EXCEPTION 'Firme vecchie ancora presenti'; END IF;
  RAISE NOTICE 'FM72 tappa 3a: tutti i casi superati';
END;
$test$;
ROLLBACK;
