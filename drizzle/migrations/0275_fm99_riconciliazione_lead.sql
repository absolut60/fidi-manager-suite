ALTER TABLE public.lead DROP CONSTRAINT lead_conversione_tipo_chk;
ALTER TABLE public.lead ADD CONSTRAINT lead_conversione_tipo_chk CHECK (conversione_tipo IS NULL OR conversione_tipo = ANY (ARRAY['nuovo_cliente'::text, 'contatto_cliente'::text, 'import_gamma'::text]));

CREATE TABLE public.lead_riconciliazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
  esito text NOT NULL CHECK (esito IN ('collegato_auto','da_riconciliare','collegato_manuale','annullato')),
  cliente_id uuid NULL REFERENCES public.clienti(id) ON DELETE SET NULL,
  chiave text NULL CHECK (chiave IN ('partita_iva','codice_fiscale')),
  candidati jsonb NOT NULL DEFAULT '[]'::jsonb,
  nome_lead text,
  lead_partita_iva text,
  lead_codice_fiscale text,
  lead_creato_da uuid,
  cliente_ragione_sociale text,
  cliente_codice text,
  importazione_id uuid NULL REFERENCES public.importazioni(id) ON DELETE SET NULL,
  operatore_id uuid,
  creato_il timestamptz NOT NULL DEFAULT now(),
  risolto_da uuid,
  risolto_il timestamptz,
  nota text
);
CREATE UNIQUE INDEX lead_riconciliazioni_aperta_uniq ON public.lead_riconciliazioni (lead_id) WHERE esito = 'da_riconciliare';
CREATE INDEX lead_riconciliazioni_esito_idx ON public.lead_riconciliazioni (esito, creato_il DESC);
CREATE INDEX lead_riconciliazioni_lead_idx ON public.lead_riconciliazioni (lead_id);
GRANT SELECT ON public.lead_riconciliazioni TO authenticated;
GRANT ALL ON public.lead_riconciliazioni TO service_role;
REVOKE ALL ON public.lead_riconciliazioni FROM anon;
ALTER TABLE public.lead_riconciliazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Secondo fattore (FM44)" ON public.lead_riconciliazioni AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY lead_riconciliazioni_select ON public.lead_riconciliazioni FOR SELECT TO authenticated
  USING ((SELECT public.has_lead_module_access((SELECT auth.uid()))) OR lead_creato_da = (SELECT auth.uid()));
COMMENT ON TABLE public.lead_riconciliazioni IS 'FM99: registro riconciliazione lead -> cliente dopo import clienti. Scritto solo da riconcilia_lead_clienti, collega_lead_da_riconciliare e annulla_conversione_lead.';

CREATE OR REPLACE FUNCTION public._collega_lead_a_cliente_interno(_lead_id uuid, _cliente_id uuid, _operatore uuid, _conversione_tipo text, _nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_lead public.lead%ROWTYPE;
  v_cliente record;
  ct record;
  v_eq uuid;
  v_finale uuid;
  v_spostati int := 0;
  v_uniti int := 0;
  v_creati int := 0;
BEGIN
  v_uid := _operatore;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NOT NULL OR v_lead.stato = 'convertito' THEN
    RAISE EXCEPTION 'Lead già convertito';
  END IF;

  SELECT ragione_sociale, codice_gestionale INTO v_cliente FROM public.clienti WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;

  -- Contatti del lead: spostamento oppure unione con contatto equivalente del cliente
  FOR ct IN SELECT * FROM public.contatti WHERE lead_id = _lead_id AND cliente_id IS NULL ORDER BY created_at
  LOOP
    v_eq := public.trova_contatto_equivalente(_cliente_id, NULL, ct.nome, ct.cognome, ct.email, ct.cellulare, ct.codice_fiscale);
    IF v_eq IS NULL THEN
      UPDATE public.contatti SET cliente_id = _cliente_id WHERE id = ct.id;
      v_finale := ct.id;
      v_spostati := v_spostati + 1;
    ELSE
      PERFORM public.trasferisci_privacy_contatto(ct.id, v_eq);
      UPDATE public.contatti d SET email = coalesce(d.email, ct.email), cellulare = coalesce(d.cellulare, ct.cellulare), codice_fiscale = coalesce(d.codice_fiscale, ct.codice_fiscale) WHERE d.id = v_eq;
      UPDATE public.eventi_partecipanti SET contatto_id = v_eq WHERE contatto_id = ct.id;
      -- messaggi_whatsapp ha il vincolo messaggi_whatsapp_uniq_dest UNIQUE (campagna_id, contatto_id):
      -- i messaggi di una campagna già registrata sul contatto esistente non vengono spostati
      -- e seguono la cancellazione del contatto del lead (lo storico di quella campagna resta sul contatto esistente).
      UPDATE public.messaggi_whatsapp m SET contatto_id = v_eq
       WHERE m.contatto_id = ct.id
         AND (m.campagna_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM public.messaggi_whatsapp x WHERE x.contatto_id = v_eq AND x.campagna_id = m.campagna_id));
      UPDATE public.campagne_email_destinatari SET contatto_id = v_eq WHERE contatto_id = ct.id;
      DELETE FROM public.contatti WHERE id = ct.id;
      v_finale := v_eq;
      v_uniti := v_uniti + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM public.get_stato_consensi(ARRAY[v_finale]) sc WHERE sc.whatsapp) THEN
      BEGIN
        PERFORM public.upsert_iscritto_da_contatto(v_finale);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  -- Lead senza contatti ma con nome e cognome: crea (o riusa) il contatto nel cliente
  IF v_spostati = 0 AND v_uniti = 0
     AND NULLIF(btrim(coalesce(v_lead.nome, '')), '') IS NOT NULL
     AND NULLIF(btrim(coalesce(v_lead.cognome, '')), '') IS NOT NULL THEN
    PERFORM public.crea_o_riusa_contatto_in_soggetto(
      _cliente_id := _cliente_id,
      _lead_id := NULL,
      _nome := v_lead.nome,
      _cognome := v_lead.cognome,
      _email := v_lead.email,
      _cellulare := v_lead.cellulare,
      _codice_fiscale := v_lead.codice_fiscale
    );
    v_creati := 1;
  END IF;

  UPDATE public.cantieri SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.opportunita SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.consensi_log SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.eventi_partecipanti SET cliente_id = _cliente_id, riconciliato_il = coalesce(riconciliato_il, now()) WHERE lead_id = _lead_id AND cliente_id IS NULL;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, v_lead.stato::text, 'convertito', v_uid, _nota);

  UPDATE public.lead SET cliente_id = _cliente_id, convertito_il = now(), convertito_da = v_uid, stato = 'convertito', conversione_tipo = _conversione_tipo WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true, 'cliente_id', _cliente_id, 'contatti_spostati', v_spostati, 'contatti_uniti', v_uniti, 'contatti_creati', v_creati);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._collega_lead_a_cliente_interno(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._collega_lead_a_cliente_interno(uuid, uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.collega_lead_a_cliente(_lead_id uuid, _cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_lead public.lead%ROWTYPE;
  v_cliente record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NOT NULL OR v_lead.stato = 'convertito' THEN
    RAISE EXCEPTION 'Lead già convertito';
  END IF;

  SELECT ragione_sociale, codice_gestionale INTO v_cliente FROM public.clienti WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;

  RETURN public._collega_lead_a_cliente_interno(
    _lead_id, _cliente_id, v_uid, 'contatto_cliente',
    'Collegato come contatto del cliente ' || v_cliente.ragione_sociale || coalesce(' (' || v_cliente.codice_gestionale || ')', ''));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.collega_lead_a_cliente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_lead_a_cliente(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.annulla_conversione_lead(_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.lead%ROWTYPE;
  v_cliente uuid;
  v_parts text[] := '{}';
  v_tot bigint := 0;
  v_n bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'amministratore') THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Lead non convertito';
  END IF;
  v_cliente := v_lead.cliente_id;

  IF v_lead.conversione_tipo IN ('contatto_cliente', 'import_gamma') THEN
    -- Il cliente esisteva già: NON va eliminato. Si scollega soltanto ciò che è ancora legato al lead.
    UPDATE public.contatti SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.cantieri SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.opportunita SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.consensi_log SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.eventi_partecipanti SET cliente_id = NULL, riconciliato_il = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.lead SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'nuovo', conversione_tipo = NULL WHERE id = _lead_id;
    IF v_lead.conversione_tipo = 'import_gamma' THEN
      INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
      VALUES (_lead_id, 'convertito', 'nuovo', auth.uid(), 'Collegamento da import Gamma al cliente ' || v_cliente || ' annullato (il cliente non è stato toccato; eventuali contatti già uniti restano nel cliente)');
      UPDATE public.lead_riconciliazioni
         SET esito = 'annullato', risolto_da = auth.uid(), risolto_il = now()
       WHERE id = (SELECT lr.id FROM public.lead_riconciliazioni lr
                    WHERE lr.lead_id = _lead_id AND lr.esito IN ('collegato_auto', 'collegato_manuale')
                    ORDER BY coalesce(lr.risolto_il, lr.creato_il) DESC, lr.creato_il DESC LIMIT 1);
    ELSE
      INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
      VALUES (_lead_id, 'convertito', 'nuovo', auth.uid(), 'Collegamento al cliente ' || v_cliente || ' annullato (il cliente non è stato toccato; eventuali contatti già uniti restano nel cliente)');
    END IF;
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM public.scadenze WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('scadenze: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.richieste_fido WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('richieste_fido: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.azioni_recupero WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('azioni_recupero: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.pratiche_legali WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('pratiche_legali: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.assicurazioni_credito WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('assicurazioni_credito: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.piani_rientro WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('piani_rientro: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.storico_fido WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('storico_fido: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.solleciti WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('solleciti: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.note_legali_gestionali WHERE cliente_id = v_cliente;
  IF v_n > 0 THEN
    v_parts := v_parts || ('note_legali_gestionali: ' || v_n);
    v_tot := v_tot + v_n;
  END IF;

  IF v_tot > 0 THEN
    RAISE EXCEPTION 'Impossibile annullare: il cliente ha già dati collegati (%). Annullamento bloccato per non perdere dati.', array_to_string(v_parts, ', ');
  END IF;

  UPDATE public.contatti SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
  UPDATE public.cantieri SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
  UPDATE public.consensi_log SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;

  UPDATE public.lead
     SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'qualificato', conversione_tipo = NULL
   WHERE id = _lead_id;

  DELETE FROM public.clienti WHERE id = v_cliente;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, 'convertito', 'qualificato', auth.uid(), 'Conversione annullata, cliente ' || v_cliente || ' eliminato');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.annulla_conversione_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annulla_conversione_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.riconcilia_lead_clienti(_importazione_id uuid, _operatore uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op uuid := _operatore;
  v_origine text := '«Controlla ora»';
  r record;
  v_cli record;
  v_aperta uuid;
  v_ric uuid;
  v_nota text;
  v_coll int := 0;
  v_dar int := 0;
  v_chiusi int := 0;
  v_err jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
  v_auto uuid[] := '{}';
  v_nuove uuid[] := '{}';
BEGIN
  IF _importazione_id IS NOT NULL THEN
    SELECT eseguita_da, coalesce(completata_at, created_at) AS quando INTO r FROM public.importazioni WHERE id = _importazione_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Importazione inesistente';
    END IF;
    v_op := coalesce(_operatore, r.eseguita_da);
    v_origine := 'import clienti del ' || to_char(r.quando AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY');
  END IF;

  -- Righe aperte il cui lead è stato collegato in altro modo
  UPDATE public.lead_riconciliazioni lr
     SET esito = 'annullato', risolto_da = v_op, risolto_il = now(), nota = 'Lead già collegato in altro modo'
    FROM public.lead l
   WHERE l.id = lr.lead_id AND lr.esito = 'da_riconciliare'
     AND (l.cliente_id IS NOT NULL OR l.stato = 'convertito');
  GET DIAGNOSTICS v_chiusi = ROW_COUNT;

  FOR r IN
    WITH ld AS (
      SELECT l.id, k.piva, k.cf
        FROM public.lead l
        CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(l.partita_iva, ''), '\D', '', 'g') AS piva,
                                   upper(btrim(coalesce(l.codice_fiscale, ''))) AS cf) k
       WHERE l.cliente_id IS NULL AND l.stato <> 'convertito'
    ),
    lk AS (
      SELECT id AS lead_id, piva AS k, true AS da_piva FROM ld
       WHERE piva ~ '^[0-9]{11}$' AND piva NOT IN ('102730', '102729')
      UNION
      SELECT id, cf, false FROM ld WHERE length(cf) IN (11, 16)
    ),
    cn AS (
      SELECT c.id, regexp_replace(coalesce(c.partita_iva, ''), '\D', '', 'g') AS piva,
             upper(btrim(coalesce(c.codice_fiscale, ''))) AS cf
        FROM public.clienti c
    ),
    ck AS (
      SELECT id AS cliente_id, piva AS k FROM cn WHERE piva ~ '^[0-9]{11}$' AND piva NOT IN ('102730', '102729')
      UNION
      SELECT id, cf FROM cn WHERE length(cf) IN (11, 16)
    ),
    m AS (
      SELECT lk.lead_id, ck.cliente_id, bool_or(lk.da_piva) AS da_piva
        FROM lk JOIN ck ON ck.k = lk.k
       GROUP BY lk.lead_id, ck.cliente_id
    )
    SELECT m.lead_id,
           count(*) AS n,
           bool_or(m.da_piva) AS da_piva,
           (array_agg(m.cliente_id))[1] AS unico,
           jsonb_agg(jsonb_build_object('id', c.id, 'ragione_sociale', c.ragione_sociale, 'codice_gestionale', c.codice_gestionale,
                                        'partita_iva', c.partita_iva, 'codice_fiscale', c.codice_fiscale)
                     ORDER BY c.ragione_sociale, c.id) AS candidati
      FROM m JOIN public.clienti c ON c.id = m.cliente_id
     GROUP BY m.lead_id
  LOOP
    BEGIN
      SELECT id INTO v_aperta FROM public.lead_riconciliazioni WHERE lead_id = r.lead_id AND esito = 'da_riconciliare';
      IF r.n = 1 THEN
        SELECT ragione_sociale, codice_gestionale INTO v_cli FROM public.clienti WHERE id = r.unico;
        IF _importazione_id IS NULL THEN
          v_nota := 'Riconciliato da ' || v_origine || ': cliente ' || v_cli.ragione_sociale || coalesce(' (' || v_cli.codice_gestionale || ')', '');
        ELSE
          v_nota := 'Riconciliato dall''' || v_origine || ': cliente ' || v_cli.ragione_sociale || coalesce(' (' || v_cli.codice_gestionale || ')', '');
        END IF;
        PERFORM public._collega_lead_a_cliente_interno(r.lead_id, r.unico, v_op, 'import_gamma', v_nota);
        IF v_aperta IS NOT NULL THEN
          UPDATE public.lead_riconciliazioni lr
             SET esito = 'collegato_auto', cliente_id = r.unico,
                 chiave = CASE WHEN r.da_piva THEN 'partita_iva' ELSE 'codice_fiscale' END,
                 candidati = r.candidati,
                 nome_lead = coalesce(nullif(btrim(l.ragione_sociale), ''), nullif(btrim(concat_ws(' ', l.nome, l.cognome)), '')),
                 lead_partita_iva = l.partita_iva, lead_codice_fiscale = l.codice_fiscale, lead_creato_da = l.created_by,
                 cliente_ragione_sociale = v_cli.ragione_sociale, cliente_codice = v_cli.codice_gestionale,
                 importazione_id = _importazione_id, operatore_id = v_op, risolto_da = v_op, risolto_il = now(), nota = v_nota
            FROM public.lead l
           WHERE lr.id = v_aperta AND l.id = r.lead_id
          RETURNING lr.id INTO v_ric;
        ELSE
          INSERT INTO public.lead_riconciliazioni (lead_id, esito, cliente_id, chiave, candidati, nome_lead, lead_partita_iva,
                 lead_codice_fiscale, lead_creato_da, cliente_ragione_sociale, cliente_codice, importazione_id, operatore_id,
                 risolto_da, risolto_il, nota)
          SELECT l.id, 'collegato_auto', r.unico, CASE WHEN r.da_piva THEN 'partita_iva' ELSE 'codice_fiscale' END, r.candidati,
                 coalesce(nullif(btrim(l.ragione_sociale), ''), nullif(btrim(concat_ws(' ', l.nome, l.cognome)), '')),
                 l.partita_iva, l.codice_fiscale, l.created_by, v_cli.ragione_sociale, v_cli.codice_gestionale,
                 _importazione_id, v_op, v_op, now(), v_nota
            FROM public.lead l WHERE l.id = r.lead_id
          RETURNING id INTO v_ric;
        END IF;
        v_auto := v_auto || v_ric;
        v_coll := v_coll + 1;
      ELSE
        IF v_aperta IS NOT NULL THEN
          UPDATE public.lead_riconciliazioni lr
             SET candidati = r.candidati,
                 chiave = CASE WHEN r.da_piva THEN 'partita_iva' ELSE 'codice_fiscale' END,
                 nome_lead = coalesce(nullif(btrim(l.ragione_sociale), ''), nullif(btrim(concat_ws(' ', l.nome, l.cognome)), '')),
                 lead_partita_iva = l.partita_iva, lead_codice_fiscale = l.codice_fiscale, lead_creato_da = l.created_by,
                 importazione_id = _importazione_id, operatore_id = v_op
            FROM public.lead l
           WHERE lr.id = v_aperta AND l.id = r.lead_id
          RETURNING lr.id INTO v_ric;
        ELSE
          INSERT INTO public.lead_riconciliazioni (lead_id, esito, chiave, candidati, nome_lead, lead_partita_iva,
                 lead_codice_fiscale, lead_creato_da, importazione_id, operatore_id)
          SELECT l.id, 'da_riconciliare', CASE WHEN r.da_piva THEN 'partita_iva' ELSE 'codice_fiscale' END, r.candidati,
                 coalesce(nullif(btrim(l.ragione_sociale), ''), nullif(btrim(concat_ws(' ', l.nome, l.cognome)), '')),
                 l.partita_iva, l.codice_fiscale, l.created_by, _importazione_id, v_op
            FROM public.lead l WHERE l.id = r.lead_id
          RETURNING id INTO v_ric;
          v_nuove := v_nuove || v_ric;
        END IF;
        v_dar := v_dar + 1;
      END IF;
      v_ids := v_ids || v_ric;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err || jsonb_build_array(jsonb_build_object('lead_id', r.lead_id, 'errore', SQLERRM));
    END;
  END LOOP;

  -- Notifiche in app: un errore qui non annulla mai i collegamenti
  BEGIN
    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT d.uid, 'lead_riconciliato', 'Lead diventato cliente',
           coalesce(lr.nome_lead, '—') || ' → ' || coalesce(lr.cliente_ragione_sociale, '—') || coalesce(' (' || lr.cliente_codice || ')', ''),
           '/lead/riconciliazione?vista=riconciliati',
           jsonb_build_object('lead_id', lr.lead_id, 'cliente_id', lr.cliente_id, 'riconciliazione_id', lr.id)
      FROM public.lead_riconciliazioni lr
      CROSS JOIN LATERAL (
        SELECT lr.lead_creato_da AS uid
        UNION
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'amministratore'
      ) d
      JOIN public.profili p ON p.id = d.uid AND p.attivo
     WHERE lr.id = ANY (v_auto)
       AND (_importazione_id IS NOT NULL OR d.uid IS DISTINCT FROM v_op);

    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT d.uid, 'lead_da_riconciliare', 'Lead da riconciliare',
           coalesce(lr.nome_lead, '—') || ': ' || jsonb_array_length(lr.candidati) || ' clienti possibili',
           '/lead/riconciliazione?vista=da-riconciliare',
           jsonb_build_object('lead_id', lr.lead_id, 'riconciliazione_id', lr.id)
      FROM public.lead_riconciliazioni lr
      CROSS JOIN LATERAL (
        SELECT DISTINCT ur.user_id AS uid FROM public.user_roles ur WHERE ur.role = 'amministratore'
      ) d
      JOIN public.profili p ON p.id = d.uid AND p.attivo
     WHERE lr.id = ANY (v_nuove)
       AND (_importazione_id IS NOT NULL OR d.uid IS DISTINCT FROM v_op);
  EXCEPTION WHEN OTHERS THEN
    v_err := v_err || jsonb_build_array(jsonb_build_object('notifiche', SQLERRM));
  END;

  RETURN jsonb_build_object('collegati', v_coll, 'da_riconciliare', v_dar, 'chiusi', v_chiusi,
                            'errori', v_err, 'riconciliazioni', to_jsonb(v_ids));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.riconcilia_lead_clienti(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riconcilia_lead_clienti(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.riconcilia_lead_ora()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'amministratore') THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  RETURN public.riconcilia_lead_clienti(NULL, auth.uid());
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.riconcilia_lead_ora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_lead_ora() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.collega_lead_da_riconciliare(_riconciliazione_id uuid, _cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.lead_riconciliazioni%ROWTYPE;
  v_cli record;
  v_nota text;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT * INTO v_r FROM public.lead_riconciliazioni WHERE id = _riconciliazione_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Riconciliazione inesistente';
  END IF;
  IF v_r.esito <> 'da_riconciliare' THEN
    RAISE EXCEPTION 'Riconciliazione già risolta';
  END IF;
  IF _cliente_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_r.candidati) e WHERE e->>'id' = _cliente_id::text) THEN
    RAISE EXCEPTION 'Cliente non tra i candidati';
  END IF;
  SELECT ragione_sociale, codice_gestionale INTO v_cli FROM public.clienti WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;
  v_nota := 'Collegato a mano dalla riconciliazione: cliente ' || v_cli.ragione_sociale || coalesce(' (' || v_cli.codice_gestionale || ')', '');
  v_res := public._collega_lead_a_cliente_interno(v_r.lead_id, _cliente_id, v_uid, 'import_gamma', v_nota);
  UPDATE public.lead_riconciliazioni lr
     SET esito = 'collegato_manuale', cliente_id = _cliente_id,
         nome_lead = coalesce(nullif(btrim(l.ragione_sociale), ''), nullif(btrim(concat_ws(' ', l.nome, l.cognome)), ''), lr.nome_lead),
         lead_partita_iva = l.partita_iva, lead_codice_fiscale = l.codice_fiscale, lead_creato_da = l.created_by,
         cliente_ragione_sociale = v_cli.ragione_sociale, cliente_codice = v_cli.codice_gestionale,
         risolto_da = v_uid, risolto_il = now(), nota = v_nota
    FROM public.lead l
   WHERE lr.id = _riconciliazione_id AND l.id = v_r.lead_id;
  RETURN v_res || jsonb_build_object('riconciliazione_id', _riconciliazione_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.collega_lead_da_riconciliare(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_lead_da_riconciliare(uuid, uuid) TO authenticated, service_role;