CREATE OR REPLACE FUNCTION public.get_sinistri_aperti()
RETURNS TABLE (
  polizza_id uuid,
  cliente_id uuid,
  ragione_sociale text,
  store_nome text,
  data_apertura_sinistro date,
  importo_sinistro numeric,
  numero_sinistro text,
  esito_sinistro text,
  note_sinistro text,
  numero_polizza text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ac.id AS polizza_id,
    ac.cliente_id,
    c.ragione_sociale,
    s.nome AS store_nome,
    ac.data_apertura_sinistro,
    ac.importo_sinistro,
    ac.numero_sinistro,
    ac.esito_sinistro,
    ac.note_sinistro,
    ac.numero_polizza
  FROM public.assicurazioni_credito ac
  JOIN public.clienti c ON c.id = ac.cliente_id
  LEFT JOIN public.stores s ON s.id = c.store_id
  WHERE ac.assicuratore = 'POUEY'
    AND ac.stato = 'sinistro_aperto'
  ORDER BY ac.data_apertura_sinistro DESC NULLS LAST, c.ragione_sociale ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_sinistri_aperti() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sinistri_aperti() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sinistri_aperti() TO supabase_read_only_user;