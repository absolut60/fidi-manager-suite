-- FM52: get_previsione_incassi_coperture segue i filtri multipli Store/Agente (come scadenziario_clienti_base, 0083).
-- p_store_id uuid -> p_store_ids uuid[], p_agente text -> p_agenti text[] (stessa posizione, DEFAULT NULL; NULL o vuoto = tutti).
-- Corpo ricreato da pg_get_functiondef cambiando solo i parametri e le due condizioni della CTE vis.
DO $mig$
DECLARE
  v_oid oid;
  v_n int;
  v_def text;
  c_store_old text := '(p_store_id IS NULL OR cl.store_id = p_store_id)';
  c_store_new text := '(p_store_ids IS NULL OR cardinality(p_store_ids) = 0 OR cl.store_id = ANY(p_store_ids))';
  c_ag_old text := '(p_agente IS NULL OR (p_agente = ''__none__'' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)';
  c_ag_new text := '(p_agenti IS NULL OR cardinality(p_agenti) = 0 OR (cl.codice_agente IS NULL AND ''__none__'' = ANY(p_agenti)) OR cl.codice_agente = ANY(p_agenti))';
BEGIN
  SELECT count(*), min(p.oid) INTO v_n, v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_previsione_incassi_coperture';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FM52: get_previsione_incassi_coperture ha % versioni', v_n; END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position('p_store_id uuid DEFAULT NULL::uuid, p_agente text DEFAULT NULL::text' in v_def) = 0
     OR position(c_store_old in v_def) = 0 OR position(c_ag_old in v_def) = 0 THEN
    RAISE EXCEPTION 'FM52: definizione inattesa';
  END IF;
  v_def := replace(v_def, 'p_store_id uuid DEFAULT NULL::uuid, p_agente text DEFAULT NULL::text',
                          'p_store_ids uuid[] DEFAULT NULL::uuid[], p_agenti text[] DEFAULT NULL::text[]');
  v_def := replace(replace(v_def, c_store_old, c_store_new), c_ag_old, c_ag_new);
  IF v_def ~ '\m(p_store_id|p_agente)\M' THEN RAISE EXCEPTION 'FM52: riferimenti residui'; END IF;
  v_def := replace(v_def, 'CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION');
  EXECUTE 'DROP FUNCTION public.get_previsione_incassi_coperture(uuid, text)';
  EXECUTE v_def;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid[], text[]) TO authenticated, service_role;