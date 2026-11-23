-- Database di prova isolato: clone fm96, dipendenze reali e migrazioni 0273/0274.
-- Le righe fixture e ogni operazione di prova sono annullate da ROLLBACK.
BEGIN;
CREATE TEMP TABLE fm98_matrice (id uuid, ruolo public.app_role, abilitata boolean, legge boolean, inserisce boolean, gestisce boolean);
INSERT INTO fm98_matrice VALUES
 ('98000000-0000-0000-0000-000000000001','amministratore',false,true,true,true),
 ('98000000-0000-0000-0000-000000000002','preventivi_write',true,true,true,false),
 ('98000000-0000-0000-0000-000000000003','preventivi_write',false,false,false,false),
 ('98000000-0000-0000-0000-000000000004','responsabile_showroom',true,true,true,true),
 ('98000000-0000-0000-0000-000000000005','responsabile_showroom',false,false,false,false),
 ('98000000-0000-0000-0000-000000000006','store_manager',false,true,false,false),
 ('98000000-0000-0000-0000-000000000007','direzione',true,false,false,false),
 ('98000000-0000-0000-0000-000000000008','showroom',true,true,false,false),
 ('98000000-0000-0000-0000-000000000009','preventivi_read',true,true,false,false),
 ('98000000-0000-0000-0000-000000000010','preventivi_manage',true,true,true,true),
 ('98000000-0000-0000-0000-000000000011','preventivi_manage',false,false,false,false),
 ('98000000-0000-0000-0000-000000000012','showroom',false,false,false,false),
 ('98000000-0000-0000-0000-000000000013','preventivi_read',false,false,false,false);
INSERT INTO public.profili(id,linee_abilitate) SELECT id, CASE WHEN abilitata THEN ARRAY['showroom']::public.linea_preventivo[] ELSE '{}'::public.linea_preventivo[] END FROM fm98_matrice;
INSERT INTO public.user_roles(user_id,role) SELECT id,ruolo FROM fm98_matrice;
INSERT INTO public.note_preventivo_libreria(id,linea,titolo,testo,creato_da)
 SELECT id,'showroom','Nota condivisa','Testo originale','98000000-0000-0000-0000-000000000099' FROM fm98_matrice;
GRANT SELECT ON fm98_matrice TO authenticated;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE m record; n integer; nuova uuid; riuscita boolean;
BEGIN
  FOR m IN SELECT * FROM fm98_matrice ORDER BY id LOOP
    PERFORM set_config('request.jwt.claims',json_build_object('sub',m.id,'role','authenticated','aal','aal2')::text,true);
    IF public.auth_legge_note_preventivo('showroom') IS DISTINCT FROM m.legge THEN RAISE EXCEPTION 'Lettura helper: %',m.ruolo; END IF;
    IF public.auth_scrive_note_preventivo('showroom',m.id,'inserisci') IS DISTINCT FROM m.inserisce THEN RAISE EXCEPTION 'Inserimento helper: %',m.ruolo; END IF;
    SELECT count(*) INTO n FROM public.note_preventivo_libreria WHERE id=m.id;
    IF (n=1) IS DISTINCT FROM m.legge THEN RAISE EXCEPTION 'RLS lettura: %',m.ruolo; END IF;
    nuova := gen_random_uuid(); riuscita := true;
    BEGIN
      INSERT INTO public.note_preventivo_libreria(id,linea,titolo,testo) VALUES(nuova,'showroom','Nuova nota','Testo');
    EXCEPTION WHEN insufficient_privilege THEN riuscita := false;
    END;
    IF riuscita IS DISTINCT FROM m.inserisce THEN RAISE EXCEPTION 'RLS inserimento: %',m.ruolo; END IF;
    IF riuscita THEN
      UPDATE public.note_preventivo_libreria SET testo='Propria aggiornata',aggiornato_da=m.id WHERE id=nuova;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n<>1 THEN RAISE EXCEPTION 'Autore non può modificare: %',m.ruolo; END IF;
      DELETE FROM public.note_preventivo_libreria WHERE id=nuova;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n<>1 THEN RAISE EXCEPTION 'Autore non può eliminare: %',m.ruolo; END IF;
    END IF;
    UPDATE public.note_preventivo_libreria SET testo='Aggiornata' WHERE id=m.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF (n=1) IS DISTINCT FROM m.gestisce THEN RAISE EXCEPTION 'RLS modifica altrui: %',m.ruolo; END IF;
    DELETE FROM public.note_preventivo_libreria WHERE id=m.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF (n=1) IS DISTINCT FROM m.gestisce THEN RAISE EXCEPTION 'RLS elimina altrui: %',m.ruolo; END IF;
    RAISE NOTICE 'PASS ruolo %, linea abilitata %',m.ruolo,m.abilitata;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"sub":"98000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
  BEGIN
    INSERT INTO public.note_preventivo_libreria(linea,titolo,testo,creato_da) VALUES('showroom','Autore falso','Testo','98000000-0000-0000-0000-000000000099');
    RAISE EXCEPTION 'Autore falsificabile';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.note_preventivo_libreria(linea,titolo,testo) VALUES('showroom',repeat('A',121),'Testo');
    RAISE EXCEPTION 'Titolo oltre 120 ammesso';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.note_preventivo_libreria(linea,titolo,testo) VALUES('showroom','  ','Testo');
    RAISE EXCEPTION 'Titolo vuoto ammesso';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.note_preventivo_libreria(linea,titolo,testo) VALUES('showroom','Titolo','   ');
    RAISE EXCEPTION 'Testo vuoto ammesso';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{"sub":"98000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
  SELECT count(*) INTO n FROM public.note_preventivo_libreria;
  IF n<>0 THEN RAISE EXCEPTION 'MFA non applicata'; END IF;
END;
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN PERFORM 1 FROM public.note_preventivo_libreria; RAISE EXCEPTION 'Anon legge'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.note_preventivo_libreria(linea,titolo,testo) VALUES('showroom','Nota','Testo'); RAISE EXCEPTION 'Anon inserisce'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.auth_legge_note_preventivo('showroom'); RAISE EXCEPTION 'Anon esegue helper'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS anon: nessun accesso';
END;
$test$;
RESET ROLE;
DO $test$
DECLARE p uuid := gen_random_uuid(); o uuid; u uuid := '98000000-0000-0000-0000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated','aal','aal2')::text,true);
  INSERT INTO public.preventivi(id,tipo,linea,note_cliente,note,validita) VALUES(p,'preventivo','showroom',E'Nota cliente\n\nConsegna','Nota interna','2026-12-23');
  INSERT INTO public.fm96_visibility(ordine_id,utente) VALUES(p,u);
  o := public.trasforma_preventivo_in_ordine(p,'[]'::jsonb);
  IF (SELECT note_cliente FROM public.preventivi WHERE id=o) IS DISTINCT FROM E'Nota cliente\n\nConsegna' THEN RAISE EXCEPTION 'Note cliente non copiate'; END IF;
  IF (SELECT note_cliente FROM public.preventivi WHERE id=p) IS DISTINCT FROM E'Nota cliente\n\nConsegna' THEN RAISE EXCEPTION 'Origine modificata'; END IF;
  IF (SELECT note FROM public.preventivi WHERE id=p) <> 'Nota interna' THEN RAISE EXCEPTION 'Nota interna modificata'; END IF;
  RAISE NOTICE 'PASS trasformazione: note cliente copiate, origine invariata';
END;
$test$;
ROLLBACK;