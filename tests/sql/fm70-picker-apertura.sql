-- Solo letture; eseguire con sessione authenticated autorizzata.
-- Su DB isolato i fixture del runner devono includere: cantiere visibile/nascosto,
-- recenti propri/altrui, duplicati e articoli inattivi.
DO $test$
DECLARE
  _f pg_proc; _def text; _c uuid; _r record; _codici text[];
BEGIN
  SELECT * INTO _f FROM pg_proc WHERE oid='public.articoli_picker_apertura(uuid,uuid)'::regprocedure;
  _def := pg_get_functiondef(_f.oid);
  ASSERT _f.prosecdef, 'SECURITY DEFINER';
  ASSERT 'search_path=public'=ANY(_f.proconfig), 'search_path public';
  ASSERT _def LIKE '%auth_mfa_ok()%auth_consulta_preventivi()%42501%', 'Gate MFA e consultazione';
  ASSERT NOT (SELECT rolbypassrls FROM pg_roles WHERE oid=_f.proowner), 'Owner non bypassa RLS: EXISTS deve rispettare cantieri';
  ASSERT NOT has_function_privilege('anon',_f.oid,'EXECUTE'), 'Anon non esegue';
  ASSERT NOT has_schema_privilege('authenticated','public','CREATE'), 'Nessun privilegio schema aggiunto';
  ASSERT has_function_privilege('authenticated',_f.oid,'EXECUTE') AND has_function_privilege('service_role',_f.oid,'EXECUTE'), 'Grant espliciti';
  ASSERT NOT EXISTS (SELECT 1 FROM public.articoli_picker_apertura() WHERE gruppo='cantiere'), 'Senza cantiere nessun prezzo cantiere';
  ASSERT (SELECT count(*) FROM public.articoli_picker_apertura() WHERE gruppo='recente')<=15, 'Massimo 15 recenti';
  ASSERT NOT EXISTS (SELECT codice FROM public.articoli_picker_apertura() GROUP BY codice HAVING count(*)>1), 'Codici distinti';
  FOR _r IN SELECT * FROM public.articoli_picker_apertura() LOOP
    ASSERT _r.giacenza_sede IS NULL AND _r.giacenza_logistica IS NULL, 'Senza sede nessuna giacenza';
    ASSERT EXISTS (SELECT 1 FROM public.righe_preventivo r JOIN public.blocchi_preventivo b ON b.id=r.blocco_id JOIN public.preventivi p ON p.id=b.preventivo_id WHERE p.creato_da=auth.uid() AND r.articolo_codice=_r.codice), 'Recente solo proprio';
    ASSERT EXISTS (SELECT 1 FROM public.articoli_gamma g WHERE g.codice=_r.codice AND g.attivo), 'Solo attivi';
  END LOOP;
  FOR _c IN SELECT DISTINCT cantiere_id FROM public.cantiere_listini_speciali LOOP
    SELECT array_agg(codice) INTO _codici FROM public.articoli_picker_apertura(_c) WHERE gruppo='cantiere';
    IF NOT EXISTS(SELECT 1 FROM public.cantieri c WHERE c.id=_c) THEN
      ASSERT _codici IS NULL, 'Cantiere nascosto non divulga articoli';
    END IF;
    ASSERT NOT EXISTS(SELECT 1 FROM public.articoli_picker_apertura(_c) WHERE gruppo='recente' AND codice=ANY(_codici)), 'Recenti escludono cantiere';
  END LOOP;
END;
$test$;