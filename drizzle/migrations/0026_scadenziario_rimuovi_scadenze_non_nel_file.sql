CREATE OR REPLACE FUNCTION public.rimuovi_orfani_scadenze(_importazione_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  _n integer := 0;
  _toccate bigint := 0;
  _totali bigint := 0;
BEGIN
  -- Il file MADE_VISTASCADENZE è lo scadenziario COMPLETO di Gamma: dopo un
  -- import verificato completo resta solo ciò che è nel file. Ogni scadenza non
  -- scritta da questo import (importato_da diverso) viene registrata in
  -- anomalie_import ('scadenza_non_nel_file') e rimossa.
  -- Guardia: se l'import ha scritto 0 righe o meno del 90% delle scadenze
  -- presenti, non si cancella nulla, si registra 'pulizia_scadenze_saltata'
  -- e si restituisce -1.
  SELECT count(*) INTO _toccate FROM public.scadenze WHERE importato_da = _importazione_id;
  SELECT count(*) INTO _totali FROM public.scadenze;

  IF _toccate = 0 OR _toccate < 0.9 * _totali THEN
    INSERT INTO public.anomalie_import (
      importazione_id, tipo_anomalia, campo, valore_attuale, stato, created_at
    ) VALUES (
      _importazione_id, 'pulizia_scadenze_saltata', 'scadenze',
      format('toccate %s su %s', _toccate, _totali), 'aperta', now()
    );
    RETURN -1;
  END IF;

  WITH orphans AS (
    SELECT s.id, s.cliente_id, s.numero_documento, s.key_documento, s.data_scadenza,
           s.importo_scadenza, s.stato_contabile
    FROM public.scadenze s
    WHERE s.importato_da IS DISTINCT FROM _importazione_id
  ),
  logged AS (
    INSERT INTO public.anomalie_import (
      importazione_id, cliente_id, codice_gestionale, ragione_sociale,
      tipo_anomalia, campo, valore_attuale, valore_nuovo, stato, created_at
    )
    SELECT
      _importazione_id, o.cliente_id, c.codice_gestionale, c.ragione_sociale,
      'scadenza_non_nel_file', 'scadenza',
      format('%s | %s | %s | %s | %s', o.numero_documento, o.key_documento,
             o.data_scadenza, o.importo_scadenza, o.stato_contabile),
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
$function$;

REVOKE EXECUTE ON FUNCTION public.rimuovi_orfani_scadenze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rimuovi_orfani_scadenze(uuid) TO service_role;