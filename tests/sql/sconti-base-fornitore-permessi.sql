-- Migrazione 0241: scontistica di base salvabile da amministratore/preventivi_manage/responsabile_showroom solo via
-- aggiorna_sconti_base_fornitore. Esito atteso (15/11/2026):
-- OK_ROLLBACK [responsabile_showroom: sconti=t, note=f] [amministrazione: sconti=f, note=t] [store_manager: sconti=f, note=f] [showroom: sconti=f, note=f]
DO $t$
DECLARE u uuid := 'f0f70000-0000-4000-8000-0000000000aa'; f uuid; ok boolean; n int; r text; esito text := '';
  c_u text := json_build_object('sub','f0f70000-0000-4000-8000-0000000000aa','role','authenticated','aal','aal2')::text;
BEGIN
  SELECT id INTO f FROM fornitori LIMIT 1;
  INSERT INTO auth.users(id,email,aud,role) VALUES(u,'sb@fixture.invalid','authenticated','authenticated');
  INSERT INTO profili(id,email,nome,cognome) VALUES(u,'sb@fixture.invalid','Fixture','SB') ON CONFLICT(id) DO NOTHING;
  FOREACH r IN ARRAY ARRAY['responsabile_showroom','amministrazione','store_manager','showroom'] LOOP
    DELETE FROM user_roles WHERE user_id=u;
    INSERT INTO user_roles(user_id,role) VALUES(u,r::app_role);
    UPDATE fornitori SET sconti_base=NULL WHERE id=f;
    PERFORM set_config('request.jwt.claims',c_u,true);
    ok := true;
    BEGIN SET LOCAL ROLE authenticated; PERFORM aggiorna_sconti_base_fornitore(f, ARRAY[45,5]::numeric[]); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN ok := false; RESET ROLE; END;
    IF (r='responsabile_showroom') <> ok THEN RAISE EXCEPTION 'KO %: salvataggio=%', r, ok; END IF;
    IF ok AND (SELECT sconti_base FROM fornitori WHERE id=f) IS DISTINCT FROM ARRAY[45,5]::numeric[] THEN RAISE EXCEPTION 'KO valore non salvato'; END IF;
    SET LOCAL ROLE authenticated;
    UPDATE fornitori SET note='vietato', ragione_sociale=ragione_sociale||'x', sconti_base=ARRAY[1]::numeric[] WHERE id=f;
    GET DIAGNOSTICS n=ROW_COUNT; RESET ROLE;
    IF n<>0 THEN RAISE EXCEPTION 'KO % modifica altri campi via UPDATE', r; END IF;
    ok := true;
    BEGIN SET LOCAL ROLE authenticated; PERFORM aggiorna_note_fornitore(f, 'prova'); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN ok := false; RESET ROLE; END;
    esito := esito || format('[%s: sconti=%s, note=%s] ', r, (r='responsabile_showroom'), ok);
    PERFORM set_config('request.jwt.claims','',true);
  END LOOP;
  RAISE EXCEPTION 'OK_ROLLBACK %', esito;
END $t$;
