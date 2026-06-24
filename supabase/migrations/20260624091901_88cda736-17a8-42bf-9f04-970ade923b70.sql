
CREATE OR REPLACE FUNCTION public.rimuovi_orfani_scadenze(_importazione_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer := 0;
BEGIN
  -- Triple naturali (cliente, key_documento, data_scadenza, key_tipo_effetto)
  -- presenti nell'import corrente. Per ognuna, eliminiamo le righe in DB con la
  -- stessa tripla che NON sono state toccate dall'import corrente
  -- (importo rettificato → riga vecchia orfana, non più nel file).
  WITH triples AS (
    SELECT DISTINCT cliente_id, key_documento, data_scadenza, key_tipo_effetto
    FROM public.scadenze
    WHERE importato_da = _importazione_id
  ),
  orphans AS (
    SELECT s.id, s.cliente_id, s.key_documento, s.data_scadenza,
           s.key_tipo_effetto, s.importo_scadenza, s.importato_da
    FROM public.scadenze s
    JOIN triples t
      ON t.cliente_id = s.cliente_id
     AND t.key_documento IS NOT DISTINCT FROM s.key_documento
     AND t.data_scadenza IS NOT DISTINCT FROM s.data_scadenza
     AND t.key_tipo_effetto IS NOT DISTINCT FROM s.key_tipo_effetto
    WHERE s.importato_da IS DISTINCT FROM _importazione_id
  ),
  logged AS (
    INSERT INTO public.anomalie_import (
      importazione_id, cliente_id, codice_gestionale, ragione_sociale,
      tipo_anomalia, campo, valore_attuale, valore_nuovo, stato, created_at
    )
    SELECT
      _importazione_id, o.cliente_id, c.codice_gestionale, c.ragione_sociale,
      'scadenza_orfana_rettifica', 'importo_scadenza',
      format('%s | %s | %s', COALESCE(o.key_documento,''), COALESCE(o.data_scadenza::text,''), o.importo_scadenza),
      'rimossa', 'risolta', now()
    FROM orphans o
    LEFT JOIN public.clienti c ON c.id = o.cliente_id
    RETURNING 1
  ),
  removed AS (
    DELETE FROM public.scadenze WHERE id IN (SELECT id FROM orphans) RETURNING 1
  )
  SELECT count(*)::int INTO _n FROM removed;
  RETURN COALESCE(_n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.rimuovi_orfani_scadenze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rimuovi_orfani_scadenze(uuid) TO service_role;
