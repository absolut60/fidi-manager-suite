-- FM52: Recupero crediti (Store, Operatore) e Promemoria scadenza (Store) a scelta multipla.
-- _store_id uuid -> _store_ids uuid[], _operatore_id uuid -> _operatore_ids uuid[] (stessa posizione,
-- DEFAULT NULL; NULL o elenco vuoto = tutti). Corpi ricreati da pg_get_functiondef cambiando solo
-- firma e condizioni. Eliminata la versione obsoleta a 6 parametri di get_promemoria_clienti_aggregato
-- (ambigua con quella a 7: ogni chiamata dava "is not unique"; nessun chiamante).
DO $mig$
DECLARE
  v_def text;
  c_old text;
BEGIN
  -- A. get_recupero_clienti_aggregato
  v_def := pg_get_functiondef('public.get_recupero_clienti_aggregato(uuid,uuid,text,timestamptz,timestamptz,text[],text[],integer[],uuid)'::regprocedure);
  IF position('_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid' in v_def) = 0
     OR position('(_store_id IS NULL OR c.store_id = _store_id)' in v_def) = 0
     OR position('(_operatore_id IS NULL OR a.operatore_id = _operatore_id)' in v_def) = 0 THEN
    RAISE EXCEPTION 'FM52: corpo inatteso get_recupero_clienti_aggregato';
  END IF;
  v_def := replace(v_def, '_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid',
                          '_store_ids uuid[] DEFAULT NULL::uuid[], _operatore_ids uuid[] DEFAULT NULL::uuid[]');
  v_def := replace(v_def, '(_store_id IS NULL OR c.store_id = _store_id)',
                          '(_store_ids IS NULL OR cardinality(_store_ids) = 0 OR c.store_id = ANY(_store_ids))');
  v_def := replace(v_def, '(_operatore_id IS NULL OR a.operatore_id = _operatore_id)',
                          '(_operatore_ids IS NULL OR cardinality(_operatore_ids) = 0 OR a.operatore_id = ANY(_operatore_ids))');
  IF position('_store_id ' in v_def) > 0 OR position('_operatore_id ' in v_def) > 0
     OR position('_store_id)' in v_def) > 0 OR position('_operatore_id)' in v_def) > 0 THEN
    RAISE EXCEPTION 'FM52: riferimenti residui ai vecchi parametri in get_recupero_clienti_aggregato';
  END IF;
  DROP FUNCTION public.get_recupero_clienti_aggregato(uuid,uuid,text,timestamptz,timestamptz,text[],text[],integer[],uuid);
  EXECUTE v_def;

  -- B. get_promemoria_clienti_aggregato (versione a 7 parametri)
  v_def := pg_get_functiondef('public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean,boolean)'::regprocedure);
  c_old := '(_store_id IS NULL OR c.store_id = _store_id)';
  IF position('_store_id uuid DEFAULT NULL::uuid' in v_def) = 0 OR position(c_old in v_def) = 0
     OR position('is_anticipo' in v_def) = 0 THEN
    RAISE EXCEPTION 'FM52: corpo inatteso get_promemoria_clienti_aggregato';
  END IF;
  v_def := replace(v_def, '_store_id uuid DEFAULT NULL::uuid', '_store_ids uuid[] DEFAULT NULL::uuid[]');
  v_def := replace(v_def, c_old, '(_store_ids IS NULL OR cardinality(_store_ids) = 0 OR c.store_id = ANY(_store_ids))');
  IF position('_store_id ' in v_def) > 0 OR position('_store_id)' in v_def) > 0 THEN
    RAISE EXCEPTION 'FM52: riferimenti residui a _store_id in get_promemoria_clienti_aggregato';
  END IF;
  DROP FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean);
  DROP FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean,boolean);
  EXECUTE v_def;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid[],uuid[],text,timestamptz,timestamptz,text[],text[],integer[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid[],uuid[],text,timestamptz,timestamptz,text[],text[],integer[],uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid[],text,numeric,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid[],text,numeric,boolean,boolean,boolean) TO authenticated, service_role;
