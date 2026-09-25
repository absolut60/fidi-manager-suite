CREATE TABLE public.notifiche_tipi (
  tipo text PRIMARY KEY,
  raggruppa boolean NOT NULL DEFAULT true,
  chiave_metadata text NULL,
  titolo_gruppo text NOT NULL,
  link_gruppo text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifiche_tipi TO authenticated;
GRANT ALL ON public.notifiche_tipi TO service_role;

ALTER TABLE public.notifiche_tipi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifiche tipi: autenticati leggono"
ON public.notifiche_tipi
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Notifiche tipi: amministratori inseriscono"
ON public.notifiche_tipi
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "Notifiche tipi: amministratori aggiornano"
ON public.notifiche_tipi
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "Notifiche tipi: amministratori eliminano"
ON public.notifiche_tipi
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE OR REPLACE FUNCTION public.aggiorna_notifiche_tipi_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.aggiorna_notifiche_tipi_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggiorna_notifiche_tipi_updated_at() TO service_role;

CREATE TRIGGER trg_aggiorna_notifiche_tipi_updated_at
BEFORE UPDATE ON public.notifiche_tipi
FOR EACH ROW
EXECUTE FUNCTION public.aggiorna_notifiche_tipi_updated_at();

INSERT INTO public.notifiche_tipi (tipo, raggruppa, chiave_metadata, titolo_gruppo, link_gruppo)
VALUES
  ('richiesta_da_approvare', true, 'store_id', '{gruppo}: {n} richieste da approvare', '/approvazioni'),
  ('fido_da_processare', true, 'store_id', '{gruppo}: {n} fidi da processare', '/fidi-processare'),
  ('richiesta_approvata', true, NULL, '{n} richieste approvate', '/richieste'),
  ('richiesta_rifiutata', true, NULL, '{n} richieste rifiutate', '/richieste'),
  ('comunicazione_fido', true, 'richiesta_id', '{n} nuovi messaggi su richiesta fido', NULL),
  ('chat_messaggio', true, 'canale_id', '{n} nuovi messaggi — {titolo}', NULL),
  ('task_assegnato', true, NULL, '{n} task assegnati', '/task'),
  ('ritardo_grave', true, NULL, '{n} scadenze in ritardo grave', '/recupero-crediti'),
  ('scadenza_fido', true, NULL, '{n} fidi in scadenza', '/richieste'),
  ('richiesta_interna_new_request', true, NULL, '{n} nuove richieste interne', '/richieste-interne'),
  ('richiesta_interna_sollecito', true, NULL, '{n} solleciti su richieste interne', '/richieste-interne'),
  ('variazioni_blocco_clienti', false, NULL, '{titolo}', NULL);

ALTER TABLE public.notifiche
  ADD COLUMN conteggio integer NOT NULL DEFAULT 1,
  ADD COLUMN chiave_gruppo text NULL,
  ADD COLUMN aggiornata_at timestamptz NOT NULL DEFAULT now();

UPDATE public.notifiche
SET aggiornata_at = created_at;

CREATE INDEX idx_notifiche_non_lette_gruppo
ON public.notifiche (user_id, chiave_gruppo)
WHERE letta = false;

CREATE OR REPLACE FUNCTION public.raggruppa_notifica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_raggruppa boolean := true;
  v_chiave_metadata text;
  v_titolo_gruppo text := '{n} notifiche — {titolo}';
  v_link_gruppo text;
  v_chiave text;
  v_esistente public.notifiche%ROWTYPE;
  v_conteggio integer;
  v_gruppo_etichetta text;
  v_titolo_risolto text;
  v_elementi jsonb;
  v_metadata_nuovi jsonb;
BEGIN
  SELECT nt.raggruppa, nt.chiave_metadata, nt.titolo_gruppo, nt.link_gruppo
  INTO v_raggruppa, v_chiave_metadata, v_titolo_gruppo, v_link_gruppo
  FROM public.notifiche_tipi nt
  WHERE nt.tipo = NEW.tipo;

  IF NOT FOUND THEN
    v_raggruppa := true;
    v_chiave_metadata := NULL;
    v_titolo_gruppo := '{n} notifiche — {titolo}';
    v_link_gruppo := NULL;
  END IF;

  v_chiave := NEW.tipo || ':' || COALESCE(
    CASE
      WHEN v_chiave_metadata IS NULL THEN NULL
      ELSE NEW.metadata ->> v_chiave_metadata
    END,
    ''
  );
  NEW.chiave_gruppo := v_chiave;

  IF NOT v_raggruppa THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text || '|' || v_chiave));

  SELECT n.*
  INTO v_esistente
  FROM public.notifiche n
  WHERE n.user_id = NEW.user_id
    AND n.chiave_gruppo = v_chiave
    AND n.letta = false
  ORDER BY n.aggiornata_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_conteggio := v_esistente.conteggio + 1;
  v_gruppo_etichetta := COALESCE(
    NEW.metadata ->> 'gruppo_etichetta',
    v_esistente.metadata ->> 'gruppo_etichetta',
    ''
  );

  v_titolo_risolto := v_titolo_gruppo;
  IF v_gruppo_etichetta = '' THEN
    v_titolo_risolto := replace(v_titolo_risolto, '{gruppo}: ', '');
  END IF;
  v_titolo_risolto := replace(v_titolo_risolto, '{gruppo}', v_gruppo_etichetta);
  v_titolo_risolto := replace(v_titolo_risolto, '{n}', v_conteggio::text);
  v_titolo_risolto := replace(v_titolo_risolto, '{titolo}', NEW.titolo);

  IF jsonb_typeof(v_esistente.metadata -> 'elementi') = 'array' THEN
    SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb)
    INTO v_elementi
    FROM (
      SELECT COALESCE(NEW.metadata, '{}'::jsonb) AS value, 0::bigint AS ord
      UNION ALL
      SELECT elem.value, elem.ordinality
      FROM jsonb_array_elements(v_esistente.metadata -> 'elementi') WITH ORDINALITY AS elem(value, ordinality)
      ORDER BY ord
      LIMIT 20
    ) e;
  ELSE
    v_elementi := jsonb_build_array(
      COALESCE(NEW.metadata, '{}'::jsonb),
      COALESCE(v_esistente.metadata, '{}'::jsonb)
    );
  END IF;

  v_metadata_nuovi := COALESCE(v_esistente.metadata, '{}'::jsonb)
    || jsonb_build_object('elementi', v_elementi);

  IF v_gruppo_etichetta <> '' THEN
    v_metadata_nuovi := v_metadata_nuovi
      || jsonb_build_object('gruppo_etichetta', v_gruppo_etichetta);
  END IF;

  UPDATE public.notifiche
  SET conteggio = v_conteggio,
      titolo = v_titolo_risolto,
      messaggio = 'Ultima: ' || COALESCE(NEW.messaggio, ''),
      link = COALESCE(v_link_gruppo, NEW.link),
      aggiornata_at = now(),
      metadata = v_metadata_nuovi
  WHERE id = v_esistente.id;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.raggruppa_notifica() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raggruppa_notifica() TO service_role;

CREATE TRIGGER a_raggruppa_notifica
BEFORE INSERT ON public.notifiche
FOR EACH ROW
EXECUTE FUNCTION public.raggruppa_notifica();

CREATE OR REPLACE FUNCTION public.notifica_richiesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ruolo app_role;
  _approvatore record;
  _cliente text;
  _store_nome text;
  _metadata_store jsonb := '{}'::jsonb;
BEGIN
  -- Notifica approvatori quando entra in_approvazione
  IF NEW.stato = 'in_approvazione' AND (OLD IS NULL OR OLD.stato <> 'in_approvazione') THEN
    SELECT c.ragione_sociale, s.nome
    INTO _cliente, _store_nome
    FROM public.clienti c
    LEFT JOIN public.stores s ON s.id = NEW.store_id
    WHERE c.id = NEW.cliente_id;

    IF NEW.store_id IS NOT NULL AND _store_nome IS NOT NULL THEN
      _metadata_store := jsonb_build_object(
        'store_id', NEW.store_id,
        'gruppo_etichetta', _store_nome
      );
    END IF;

    _ruolo := ('approvatore_liv' || NEW.livello_corrente)::app_role;
    FOR _approvatore IN
      SELECT DISTINCT user_id
      FROM public.user_roles
      WHERE role = _ruolo OR role = 'amministratore'
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _approvatore.user_id,
        'richiesta_da_approvare',
        'Nuova richiesta da approvare',
        format('Richiesta livello %s per %s (€ %s)', NEW.livello_corrente, COALESCE(_cliente, '—'), NEW.importo_richiesto),
        '/richieste/' || NEW.id,
        jsonb_build_object('richiesta_id', NEW.id, 'livello', NEW.livello_corrente) || _metadata_store
      );
    END LOOP;
  END IF;
  
  -- Notifica autore quando approvata/rifiutata
  IF NEW.stato IN ('approvata','rifiutata') AND OLD.stato <> NEW.stato AND NEW.created_by IS NOT NULL THEN
    IF _cliente IS NULL THEN
      SELECT c.ragione_sociale, s.nome
      INTO _cliente, _store_nome
      FROM public.clienti c
      LEFT JOIN public.stores s ON s.id = NEW.store_id
      WHERE c.id = NEW.cliente_id;
    END IF;

    IF NEW.store_id IS NOT NULL AND _store_nome IS NOT NULL THEN
      _metadata_store := jsonb_build_object(
        'store_id', NEW.store_id,
        'gruppo_etichetta', _store_nome
      );
    END IF;

    INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
    VALUES (
      NEW.created_by,
      'richiesta_' || NEW.stato::text,
      CASE WHEN NEW.stato = 'approvata' THEN 'Richiesta approvata' ELSE 'Richiesta rifiutata' END,
      format('La tua richiesta di € %s è stata %s', NEW.importo_richiesto, NEW.stato),
      '/richieste/' || NEW.id,
      jsonb_build_object('richiesta_id', NEW.id) || _metadata_store
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifica_admin_fido_approvato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _admin record;
  _cliente text;
  _store_nome text;
  _metadata_store jsonb := '{}'::jsonb;
BEGIN
  IF NEW.stato = 'approvata' AND (TG_OP = 'INSERT' OR OLD.stato <> 'approvata') THEN
    SELECT c.ragione_sociale, s.nome
    INTO _cliente, _store_nome
    FROM public.clienti c
    LEFT JOIN public.stores s ON s.id = NEW.store_id
    WHERE c.id = NEW.cliente_id;

    IF NEW.store_id IS NOT NULL AND _store_nome IS NOT NULL THEN
      _metadata_store := jsonb_build_object(
        'store_id', NEW.store_id,
        'gruppo_etichetta', _store_nome
      );
    END IF;

    FOR _admin IN
      SELECT DISTINCT user_id
      FROM public.user_roles
      WHERE role = 'amministratore'
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _admin.user_id,
        'fido_da_processare',
        'Nuovo fido da processare',
        format('Nuovo fido da processare: %s — € %s', COALESCE(_cliente, '—'), COALESCE(NEW.importo_approvato, NEW.importo_richiesto)),
        '/fidi-processare',
        jsonb_build_object('richiesta_id', NEW.id) || _metadata_store
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;