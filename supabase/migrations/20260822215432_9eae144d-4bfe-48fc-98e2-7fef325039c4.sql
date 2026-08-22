CREATE OR REPLACE FUNCTION public.set_internal_push_secret(_valore text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'internal_push_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(_valore, 'internal_push_secret');
  ELSE
    PERFORM vault.update_secret(v_id, _valore, 'internal_push_secret');
  END IF;
  RETURN length(_valore);
END;
$$;
REVOKE ALL ON FUNCTION public.set_internal_push_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_internal_push_secret(text) TO service_role;