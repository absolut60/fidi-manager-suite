-- Rimuove eventuali firme obsolete senza argomenti per evitare ambiguità
DROP FUNCTION IF EXISTS public.count_fidi_quasi_saturi();
DROP FUNCTION IF EXISTS public.get_clienti_fermi_ids();

-- 1) Conteggio clienti con fido ≥80% consumato, con scoping sede
CREATE OR REPLACE FUNCTION public.count_fidi_quasi_saturi(_store_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS sid)
  SELECT count(*)::bigint
  FROM public.clienti c CROSS JOIN eff
  WHERE (eff.sid IS NULL OR c.store_id = eff.sid)
    AND COALESCE(c.fido_gestionale, 0) > 0
    AND (c.fido_gestionale - COALESCE(c.fido_residuo, 0)) / c.fido_gestionale >= 0.80;
$$;

GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_fidi_quasi_saturi(uuid) TO supabase_read_only_user;

-- 2) Elenco ID clienti "fermi" (fatturato 12m, nulla 3m), con scoping sede
CREATE OR REPLACE FUNCTION public.get_clienti_fermi_ids(_store_id uuid DEFAULT NULL)
RETURNS TABLE(cliente_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS sid),
  fatt AS (
    SELECT f.cliente_id,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '12 months') AS a12,
      SUM(f.importo_lordo) FILTER (WHERE f.mese >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months') AS a3
    FROM public.fatturato_mensile_cliente f
    GROUP BY f.cliente_id
  )
  SELECT c.id
  FROM public.clienti c CROSS JOIN eff
  JOIN fatt ON fatt.cliente_id = c.id
  WHERE (eff.sid IS NULL OR c.store_id = eff.sid)
    AND COALESCE(c.attivo, true)
    AND COALESCE(fatt.a12, 0) > 0
    AND COALESCE(fatt.a3, 0) = 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clienti_fermi_ids(uuid) TO supabase_read_only_user;