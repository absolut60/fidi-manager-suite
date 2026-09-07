-- 1) Elenco paginato delle disiscrizioni
CREATE OR REPLACE FUNCTION public.get_disiscrizioni(_search text DEFAULT NULL, _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(
  id uuid,
  email text,
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  origine text,
  campagna_id uuid,
  campagna_nome text,
  operatore_id uuid,
  operatore_nome text,
  note text,
  created_at timestamptz,
  totale bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.email,
    o.cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    o.origine,
    o.campagna_id,
    cam.nome AS campagna_nome,
    o.operatore_id,
    NULLIF(trim(concat_ws(' ', p.nome, p.cognome)), '') AS operatore_nome,
    o.note,
    o.created_at,
    count(*) OVER () AS totale
  FROM marketing_opt_out o
  LEFT JOIN clienti c ON c.id = o.cliente_id
  LEFT JOIN campagne_email_marketing cam ON cam.id = o.campagna_id
  LEFT JOIN profili p ON p.id = o.operatore_id
  WHERE (
    _search IS NULL
    OR btrim(_search) = ''
    OR o.email ILIKE '%' || replace(replace(replace(_search, ',', ' '), '(', ' '), ')', ' ') || '%'
    OR c.ragione_sociale ILIKE '%' || replace(replace(replace(_search, ',', ' '), '(', ' '), ')', ' ') || '%'
  )
  ORDER BY o.created_at DESC
  LIMIT _limit
  OFFSET _offset
$$;

-- 2) Inserimento manuale nella lista di soppressione
CREATE OR REPLACE FUNCTION public.registra_opt_out_manuale(_email text, _note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_cliente_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'amministratore')
    OR has_role(auth.uid(), 'amministrazione')
    OR has_role(auth.uid(), 'direzione')
    OR has_role(auth.uid(), 'marketing')
  ) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  v_email := lower(btrim(_email));
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Email non valida';
  END IF;

  SELECT c.id INTO v_cliente_id
  FROM clienti c
  WHERE lower(c.email) = v_email
  LIMIT 1;

  INSERT INTO marketing_opt_out (email, cliente_id, origine, operatore_id, note)
  VALUES (v_email, v_cliente_id, 'manuale', auth.uid(), _note)
  ON CONFLICT (lower(email)) DO NOTHING;

  RETURN true;
END;
$$;

-- 3) Riattivazione (rimozione dalla lista di soppressione) — ruoli stretti
CREATE OR REPLACE FUNCTION public.riattiva_marketing(_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'amministratore')
    OR has_role(auth.uid(), 'amministrazione')
    OR has_role(auth.uid(), 'direzione')
  ) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  DELETE FROM marketing_opt_out
  WHERE lower(email) = lower(btrim(_email));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_disiscrizioni(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_disiscrizioni(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_disiscrizioni(text, int, int) TO supabase_read_only_user;

GRANT EXECUTE ON FUNCTION public.registra_opt_out_manuale(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registra_opt_out_manuale(text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.riattiva_marketing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.riattiva_marketing(text) TO service_role;