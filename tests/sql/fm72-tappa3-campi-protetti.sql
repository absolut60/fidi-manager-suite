-- FM72 tappa 3b: linee del profilo protette dal trigger profili_blocca_campi_protetti.
-- DB reale, BEGIN/ROLLBACK, utente fixture creato e annullato nella transazione.
BEGIN;
DO $test$
DECLARE
  u uuid := 'f0720300-0000-4000-8000-000000000002';
  admin uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  bloccato boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'UUID fixture già usato'; END IF;
  INSERT INTO auth.users(id, email, aud, role) VALUES (u, 'fm72-t3b@fixture.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.profili(id, email, nome, cognome) VALUES (u, 'fm72-t3b@fixture.invalid', 'Fixture', 'FM72') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (u, 'preventivi_read');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','aal','aal2')::text, true);
  bloccato := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.profili SET linee_abilitate='{sistema_made,showroom}' WHERE id=u;
    RESET ROLE;
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    bloccato := SQLERRM LIKE '%linee del preventivatore%';
  END;
  IF NOT bloccato THEN RAISE EXCEPTION 'Non admin: modifica delle proprie linee non bloccata'; END IF;
  bloccato := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.profili SET linea_predefinita='showroom' WHERE id=u;
    RESET ROLE;
  EXCEPTION WHEN raise_exception THEN RESET ROLE; bloccato := true;
  END;
  IF NOT bloccato THEN RAISE EXCEPTION 'Non admin: modifica della linea predefinita non bloccata'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',admin,'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.profili SET linee_abilitate='{sistema_made,showroom}', linea_predefinita='showroom' WHERE id=u;
  RESET ROLE;
  IF (SELECT linee_abilitate FROM public.profili WHERE id=u) IS DISTINCT FROM '{sistema_made,showroom}'::public.linea_preventivo[]
    OR (SELECT linea_predefinita FROM public.profili WHERE id=u) IS DISTINCT FROM 'showroom'
  THEN RAISE EXCEPTION 'Amministratore: modifica delle linee di un altro profilo non applicata'; END IF;
  RAISE NOTICE 'FM72 tappa 3b: casi superati';
END;
$test$;
ROLLBACK;
