-- FM54 fetta 5: SOLA OSSERVAZIONE. Registra in anomalie_import cosa si sarebbe
-- ricollegato (scadenza_ricollegabile) o perso (scadenza_collegamenti_persi).
-- Non sposta collegamenti e non cambia cosa l'import scrive o cancella.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.rimuovi_orfani_scadenze(uuid)'::regprocedure)) <> '981af6087faf0054994be816a1b9f2ed' THEN
    RAISE EXCEPTION 'rimuovi_orfani_scadenze: corpo diverso da quello atteso';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.osserva_ricollegamento_scadenze(_importazione_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  _inizio timestamptz;
  _n integer := 0;
BEGIN
  SELECT created_at INTO _inizio FROM public.importazioni WHERE id = _importazione_id;
  IF _inizio IS NULL THEN
    RETURN 0;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _osserva_ricoll (
    o_id uuid, cliente_id uuid, o_desc text, n_desc text, coda text, collegata boolean
  ) ON COMMIT DROP;
  TRUNCATE _osserva_ricoll;

  INSERT INTO _osserva_ricoll
  WITH o AS (
    SELECT s.* FROM public.scadenze s
    WHERE s.importato_da IS DISTINCT FROM _importazione_id
  ),
  n AS (
    SELECT s.* FROM public.scadenze s
    WHERE s.importato_da = _importazione_id AND s.created_at >= _inizio
  ),
  abbinate AS (
    SELECT DISTINCT ON (o.id) o.id AS o_id,
      format('%s | %s | %s | %s | %s', n.numero_documento, n.key_documento,
             n.data_scadenza, n.importo_scadenza, n.stato_contabile) AS n_desc
    FROM o
    JOIN n ON n.cliente_id = o.cliente_id
      AND (
        (o.key_documento IS NOT NULL AND n.key_documento = o.key_documento)
        OR (o.numero_documento NOT ILIKE '%ANTICIPO%'
            AND n.numero_documento = o.numero_documento
            AND n.anno_partita IS NOT DISTINCT FROM o.anno_partita)
      )
    ORDER BY o.id, abs(n.data_scadenza - o.data_scadenza),
             abs(n.importo_scadenza - o.importo_scadenza), n.id
  ),
  conteggi AS (
    SELECT o.id AS o_id, o.cliente_id,
      format('%s | %s | %s | %s | %s', o.numero_documento, o.key_documento,
             o.data_scadenza, o.importo_scadenza, o.stato_contabile) AS o_desc,
      (SELECT count(*) FROM public.azioni_recupero_scadenze x WHERE x.scadenza_id = o.id) AS az,
      (SELECT count(*) FROM public.piani_rientro_documenti x WHERE x.scadenza_id = o.id) AS pi,
      (SELECT count(*) FROM public.promemoria_scadenza_log_scadenze x WHERE x.scadenza_id = o.id) AS pr,
      (SELECT count(*) FROM public.solleciti x WHERE x.scadenza_id = o.id) AS so,
      (SELECT count(*) FROM public.reminder x WHERE x.scadenza_id = o.id) AS re,
      (o.promemoria_scadenza_inviato_il IS NOT NULL) AS segno
    FROM o
  )
  SELECT c.o_id, c.cliente_id, c.o_desc, a.n_desc,
    format(' | azioni %s | piani %s | promemoria %s | solleciti %s | reminder %s | segno_promemoria %s',
           c.az, c.pi, c.pr, c.so, c.re, CASE WHEN c.segno THEN 'si' ELSE 'no' END),
    (c.az + c.pi + c.pr + c.so + c.re > 0 OR c.segno)
  FROM conteggi c
  LEFT JOIN abbinate a ON a.o_id = c.o_id;

  INSERT INTO public.anomalie_import (
    importazione_id, cliente_id, codice_gestionale, ragione_sociale,
    tipo_anomalia, campo, valore_attuale, valore_nuovo, stato, created_at
  )
  SELECT _importazione_id, r.cliente_id, c.codice_gestionale, c.ragione_sociale,
    CASE WHEN r.n_desc IS NOT NULL THEN 'scadenza_ricollegabile' ELSE 'scadenza_collegamenti_persi' END,
    'scadenza', r.o_desc,
    CASE WHEN r.n_desc IS NOT NULL THEN r.n_desc || r.coda ELSE ltrim(r.coda, ' |') END,
    'risolta', now()
  FROM _osserva_ricoll r
  LEFT JOIN public.clienti c ON c.id = r.cliente_id
  WHERE r.n_desc IS NOT NULL OR r.collegata;

  SELECT count(*)::int INTO _n FROM _osserva_ricoll WHERE n_desc IS NOT NULL;
  TRUNCATE _osserva_ricoll;
  RETURN COALESCE(_n, 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.osserva_ricollegamento_scadenze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.osserva_ricollegamento_scadenze(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rimuovi_orfani_scadenze(_importazione_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  PERFORM public.osserva_ricollegamento_scadenze(_importazione_id);

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