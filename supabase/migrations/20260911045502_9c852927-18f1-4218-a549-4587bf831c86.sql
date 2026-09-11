CREATE OR REPLACE FUNCTION public.get_privacy_base_clienti(_cliente_ids uuid[])
RETURNS TABLE(cliente_id uuid, privacy_ok boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT x AS cliente_id FROM unnest(coalesce(_cliente_ids, '{}'::uuid[])) AS x
  ),
  ct AS (
    SELECT c.id AS contatto_id, c.cliente_id
    FROM public.contatti c
    JOIN ids ON ids.cliente_id = c.cliente_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (cl.contatto_id) cl.contatto_id, cl.valore
    FROM public.consensi_log cl
    JOIN ct ON ct.contatto_id = cl.contatto_id
    WHERE cl.tipo_consenso = 'trattamento_dati'
    ORDER BY cl.contatto_id, cl.created_at DESC, cl.id DESC
  )
  SELECT ids.cliente_id,
         EXISTS (
           SELECT 1 FROM ct
           JOIN ultimo u ON u.contatto_id = ct.contatto_id
           WHERE ct.cliente_id = ids.cliente_id AND u.valore IS TRUE
         ) AS privacy_ok
  FROM ids;
$$;

GRANT EXECUTE ON FUNCTION public.get_privacy_base_clienti(uuid[]) TO authenticated, service_role;