
CREATE OR REPLACE FUNCTION public.marca_messaggi_letti(_richiesta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT public.user_can_access_richiesta_interna(_richiesta_id) THEN
    RETURN 0;
  END IF;
  UPDATE public.richieste_interne_messaggi
     SET letto_da = array_append(COALESCE(letto_da, '{}'::uuid[]), _uid)
   WHERE request_id = _richiesta_id
     AND NOT (_uid = ANY(COALESCE(letto_da, '{}'::uuid[])));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.marca_messaggi_letti(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marca_messaggi_letti(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_richieste_con_messaggi_non_letti()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.request_id
    FROM public.richieste_interne_messaggi m
   WHERE auth.uid() IS NOT NULL
     AND NOT (auth.uid() = ANY(COALESCE(m.letto_da, '{}'::uuid[])))
     AND public.user_can_access_richiesta_interna(m.request_id);
$$;

REVOKE ALL ON FUNCTION public.get_richieste_con_messaggi_non_letti() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_richieste_con_messaggi_non_letti() TO authenticated;
