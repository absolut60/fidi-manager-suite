-- FM52: Scadenziario, filtri Store / Agente / Fascia a scelta multipla.
-- p_store_id uuid -> p_store_ids uuid[], p_agente text -> p_agenti text[], p_fascia text -> p_fasce text[]
-- (stessa posizione, DEFAULT NULL; NULL o elenco vuoto = tutti; '__none__' = cliente senza agente).
-- Regola nella fonte unica scadenziario_clienti_base. Le altre quattro funzioni sono ricreate
-- dal corpo attuale (pg_get_functiondef) cambiando solo i tre parametri e il loro passaggio;
-- in get_scadenziario_totali il conteggio "bonifici" (filtro diretto su clienti) usa le stesse condizioni.
DO $mig$
DECLARE
  v_nomi text[] := ARRAY['scadenziario_clienti_base','get_scadenziario_lista_paginata','get_scadenziario_totali','get_scadenziario_ids','get_scadenziario_per_store'];
  v_nome text;
  v_oid oid;
  v_n int;
  v_def text;
  v_defs text[] := ARRAY[]::text[];
  v_firme text[] := ARRAY[]::text[];
  c_store_old text := '(p_store_id IS NULL OR cl.store_id = p_store_id)';
  c_store_new text := '(p_store_ids IS NULL OR cardinality(p_store_ids) = 0 OR cl.store_id = ANY(p_store_ids))';
  c_ag_old text := '(p_agente IS NULL OR (p_agente = ''__none__'' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)';
  c_ag_new text := '(p_agenti IS NULL OR cardinality(p_agenti) = 0 OR (cl.codice_agente IS NULL AND ''__none__'' = ANY(p_agenti)) OR cl.codice_agente = ANY(p_agenti))';
  c_fa_old text := '(p_fascia = ''tutte'' OR j.fascia = p_fascia)';
  c_fa_new text := '(p_fasce IS NULL OR cardinality(p_fasce) = 0 OR j.fascia = ANY(p_fasce))';
BEGIN
  FOREACH v_nome IN ARRAY v_nomi LOOP
    SELECT count(*), min(p.oid) INTO v_n, v_oid FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_nome;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FM52: % ha % versioni (attesa 1)', v_nome, v_n; END IF;
    v_def := pg_get_functiondef(v_oid);
    IF position('p_store_id uuid DEFAULT NULL::uuid' in v_def) = 0
       OR position('p_fascia text DEFAULT ''tutte''::text' in v_def) = 0
       OR position('p_agente text DEFAULT NULL::text' in v_def) = 0 THEN
      RAISE EXCEPTION 'FM52: firma inattesa per %', v_nome;
    END IF;
    v_def := replace(v_def, 'p_store_id uuid DEFAULT NULL::uuid', 'p_store_ids uuid[] DEFAULT NULL::uuid[]');
    v_def := replace(v_def, 'p_fascia text DEFAULT ''tutte''::text', 'p_fasce text[] DEFAULT NULL::text[]');
    v_def := replace(v_def, 'p_agente text DEFAULT NULL::text', 'p_agenti text[] DEFAULT NULL::text[]');
    IF v_nome = 'scadenziario_clienti_base' THEN
      IF position(c_store_old in v_def) = 0 OR position(c_ag_old in v_def) = 0 OR position(c_fa_old in v_def) = 0 THEN
        RAISE EXCEPTION 'FM52: condizioni attese non trovate in %', v_nome;
      END IF;
      v_def := replace(replace(replace(v_def, c_store_old, c_store_new), c_ag_old, c_ag_new), c_fa_old, c_fa_new);
    ELSE
      IF v_nome = 'get_scadenziario_totali' THEN
        IF position('scadenziario_clienti_base(NULL, p_store_id, ''tutte'',' in v_def) = 0
           OR position(c_store_old in v_def) = 0 OR position(c_ag_old in v_def) = 0 THEN
          RAISE EXCEPTION 'FM52: corpo inatteso in %', v_nome;
        END IF;
        v_def := replace(v_def, 'scadenziario_clienti_base(NULL, p_store_id, ''tutte'',', 'scadenziario_clienti_base(NULL, p_store_ids, NULL::text[],');
        v_def := replace(replace(v_def, c_store_old, c_store_new), c_ag_old, c_ag_new);
      END IF;
      -- passaggio dei parametri a scadenziario_clienti_base
      v_def := regexp_replace(v_def, '\mp_store_id\M', 'p_store_ids', 'g');
      v_def := regexp_replace(v_def, '\mp_fascia\M', 'p_fasce', 'g');
      v_def := regexp_replace(v_def, '\mp_agente\M', 'p_agenti', 'g');
    END IF;
    IF v_def ~ '\m(p_store_id|p_fascia|p_agente)\M' THEN
      RAISE EXCEPTION 'FM52: riferimenti residui ai vecchi parametri in %', v_nome;
    END IF;
    v_def := replace(v_def, 'CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION');
    v_defs := v_defs || v_def;
    v_firme := v_firme || (v_oid::regprocedure)::text;
  END LOOP;

  FOR i IN 1 .. array_length(v_nomi, 1) LOOP
    EXECUTE 'DROP FUNCTION ' || v_firme[i];
  END LOOP;
  FOR i IN 1 .. array_length(v_nomi, 1) LOOP
    EXECUTE v_defs[i];
  END LOOP;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.scadenziario_clienti_base(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scadenziario_clienti_base(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_totali(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_totali(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_ids(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_ids(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_per_store(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_per_store(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,text[],text,numeric,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,integer,integer,text,text,integer,integer,text[],text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text,uuid[],text[],text,text,boolean,boolean,text,numeric,boolean,integer,integer,text,text,integer,integer,text[],text,numeric,boolean) TO authenticated, service_role;