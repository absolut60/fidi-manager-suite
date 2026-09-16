DO $do$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'cerca_candidati_riconciliazione',
        'collega_righe_import',
        'crea_lead_da_partecipante',
        'crea_lead_da_righe_import',
        'crea_o_riusa_contatto_in_soggetto',
        'crea_partecipante_da_nuovo_soggetto',
        'riconcilia_partecipante',
        'scarta_righe_import'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('has_lead_module_access' in v_def) = 0 THEN
      RAISE EXCEPTION 'Gate non trovato in %', r.proname;
    END IF;
    v_def := replace(v_def, 'has_lead_module_access', 'has_eventi_flusso_access');
    EXECUTE v_def;
  END LOOP;
END
$do$;