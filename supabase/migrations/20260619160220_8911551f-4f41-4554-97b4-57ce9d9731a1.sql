CREATE OR REPLACE FUNCTION public.get_fatturato_clienti_scadenziario(
  _anno_corrente int,
  _anno_prec int
)
RETURNS TABLE (
  cliente_id uuid,
  fatturato_anno_corrente numeric,
  fatturato_anno_prec numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clienti_scad AS (
    SELECT DISTINCT s.cliente_id
    FROM public.scadenze s
    WHERE s.cliente_id IS NOT NULL
      AND s.stato_contabile = 'Aperta'
  )
  SELECT
    cs.cliente_id,
    COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = _anno_corrente), 0)::numeric AS fatturato_anno_corrente,
    COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = _anno_prec), 0)::numeric AS fatturato_anno_prec
  FROM clienti_scad cs
  LEFT JOIN public.fatturato_clienti f
    ON f.cliente_id = cs.cliente_id
   AND f.anno IN (_anno_corrente, _anno_prec)
  GROUP BY cs.cliente_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_fatturato_clienti_scadenziario(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fatturato_clienti_scadenziario(int, int) TO service_role;