DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.dashboard_fidi_clienti_base()'::regprocedure);
  v_new text;
BEGIN
  IF md5(v_def) <> 'b214c3a6614d5b66197c25002e3dd06a' THEN
    RAISE EXCEPTION 'dashboard_fidi_clienti_base cambiata: md5 %', md5(v_def);
  END IF;
  v_new := v_def;
  v_new := replace(v_new, 'c.ultima_data_fatturazione, f.fido_proposto, f.segnalazioni,',
    'c.ultima_data_fatturazione, f.fido_proposto, f.segnalazioni,
           (f.regola_applicata IS NULL OR f.regola_applicata NOT IN (''sede_esclusa'',''esclusa_gruppo'')) AS nel_giro,');
  v_new := replace(v_new, 'cl.categoria = ''imprese'' AND al.cliente_id IS NOT NULL,',
    'cl.categoria = ''imprese'' AND cl.nel_giro AND al.cliente_id IS NOT NULL,');
  v_new := replace(v_new, 'cl.categoria = ''imprese'' AND COALESCE(''oltre_normale''',
    'cl.categoria = ''imprese'' AND cl.nel_giro AND COALESCE(''oltre_normale''');
  v_new := replace(v_new, 'cl.categoria = ''imprese'' AND COALESCE(''ordini_oltre_fido''',
    'cl.categoria = ''imprese'' AND cl.nel_giro AND COALESCE(''ordini_oltre_fido''');
  IF (length(v_new) - length(replace(v_new, 'cl.nel_giro', ''))) / length('cl.nel_giro') <> 3
     OR position('AS nel_giro' in v_new) = 0 THEN
    RAISE EXCEPTION 'sostituzioni non applicate correttamente';
  END IF;
  EXECUTE v_new;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_fidi_clienti_base() TO authenticated, service_role;