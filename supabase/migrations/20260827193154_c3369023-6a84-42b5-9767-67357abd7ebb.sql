CREATE OR REPLACE FUNCTION public.count_fidi_quasi_saturi()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
  FROM public.clienti
  WHERE COALESCE(fido_gestionale, 0) > 0
    AND (fido_gestionale - COALESCE(fido_residuo, 0)) / fido_gestionale >= 0.80;
$$;

GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi() TO service_role;
GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi() TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_clienti_fermi_ids()
RETURNS TABLE(cliente_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH fatt AS (
    SELECT f.cliente_id,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '12 months') AS a12,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months') AS a3
    FROM public.fatturato_mensile_cliente f
    GROUP BY f.cliente_id
  )
  SELECT c.id
  FROM public.clienti c
  JOIN fatt ON fatt.cliente_id = c.id
  WHERE COALESCE(c.attivo, true)
    AND COALESCE(fatt.a12, 0) > 0
    AND COALESCE(fatt.a3, 0) = 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids() TO supabase_read_only_user;