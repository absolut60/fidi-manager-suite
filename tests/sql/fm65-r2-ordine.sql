-- Sola lettura: firma e permessi conservati, descrizione Gamma nell'ordine.
SELECT strpos(pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure),
  'CASE WHEN v_src_riga.articolo_codice IS NOT NULL THEN (SELECT a.descrizione FROM public.articoli_gamma a WHERE a.codice = v_src_riga.articolo_codice) ELSE v_src_riga.descrizione END') > 0 AS descrizione_gamma;
SELECT has_function_privilege('authenticated','public.trasforma_preventivo_in_ordine(uuid,jsonb)','EXECUTE') AS authenticated,
  has_function_privilege('service_role','public.trasforma_preventivo_in_ordine(uuid,jsonb)','EXECUTE') AS service_role,
  has_function_privilege('anon','public.trasforma_preventivo_in_ordine(uuid,jsonb)','EXECUTE') AS anon;
SELECT count(*) AS funzioni_anon FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
AND has_function_privilege('anon',p.oid,'EXECUTE');