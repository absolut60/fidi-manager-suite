BEGIN;

-- 1. Salva tutte le policy che usano user_can_access_cliente
CREATE TEMP TABLE _saved_cliente_policies ON COMMIT DROP AS
SELECT
  pol.polrelid,
  n.nspname AS schema_name,
  cls.relname AS table_name,
  pol.polname AS policy_name,
  pol.polcmd AS cmd,
  ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles) ORDER BY r.rolname) AS roles,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE pg_get_expr(pol.polqual, pol.polrelid) LIKE '%user_can_access_cliente%'
   OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%user_can_access_cliente%';

-- 2. Elimina entrambi gli overload esistenti (il primo CASCADE rimuove anche le policy dipendenti)
DROP FUNCTION IF EXISTS public.user_can_access_cliente(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_can_access_cliente(uuid, uuid, text) CASCADE;

-- 3. Crea la funzione unica con parametri opzionali
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(
  _cliente_id uuid,
  _cli_store_id uuid DEFAULT NULL,
  _cli_codice_agente text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _cliente_id IS NOT NULL AND (
    public.auth_ha_ruolo_globale_clienti()
    OR (
      _cli_store_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profili p
        WHERE p.id = auth.uid() AND p.store_id IS NOT NULL AND p.store_id = _cli_store_id
      )
    )
    OR (
      _cli_codice_agente IS NOT NULL AND public.has_role(auth.uid(),'agente'::app_role) AND EXISTS (
        SELECT 1 FROM public.profili p
        WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL AND p.codice_agente = _cli_codice_agente
      )
    )
    OR (
      _cli_store_id IS NULL AND _cli_codice_agente IS NULL AND EXISTS (
        SELECT 1 FROM public.clienti c JOIN public.profili p ON p.id = auth.uid()
        WHERE c.id = _cliente_id AND (
          (p.store_id IS NOT NULL AND c.store_id = p.store_id)
          OR (public.has_role(auth.uid(),'agente'::app_role) AND p.codice_agente IS NOT NULL AND c.codice_agente = p.codice_agente)
        )
      )
    )
  );
$$;

-- 4. Ricrea le policy salvate con espressioni identiche
DO $$
DECLARE
  pol record;
  cmd_text text;
  roles_clause text;
  sql text;
  saved_count int;
  recreated_count int := 0;
BEGIN
  SELECT COUNT(*) INTO saved_count FROM _saved_cliente_policies;

  FOR pol IN SELECT * FROM _saved_cliente_policies ORDER BY schema_name, table_name, policy_name LOOP
    cmd_text := CASE pol.cmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
    END;

    IF array_length(pol.roles, 1) IS NULL OR array_length(pol.roles, 1) = 0 THEN
      roles_clause := '';
    ELSE
      roles_clause := ' TO ' || array_to_string(ARRAY(SELECT format('%I', rname) FROM unnest(pol.roles) AS rname), ', ');
    END IF;

    sql := format('CREATE POLICY %I ON %I.%I FOR %s%s',
      pol.policy_name, pol.schema_name, pol.table_name, cmd_text, roles_clause);

    IF pol.using_expr IS NOT NULL THEN
      sql := sql || ' USING (' || pol.using_expr || ')';
    END IF;

    IF pol.with_check_expr IS NOT NULL THEN
      sql := sql || ' WITH CHECK (' || pol.with_check_expr || ')';
    END IF;

    EXECUTE sql;
    recreated_count := recreated_count + 1;
  END LOOP;

  RAISE NOTICE 'Policy salvate: %, ricreate: %', saved_count, recreated_count;
END $$;

-- 5. Permessi
REVOKE ALL ON FUNCTION public.user_can_access_cliente(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_cliente(uuid, uuid, text) TO authenticated, service_role, supabase_read_only_user;

COMMIT;