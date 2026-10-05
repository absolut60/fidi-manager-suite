-- FM38 L4a: fonte unica per riuso contatto e trasferimento privacy; lead provvisorio esclude i collegati a un cliente.

-- 1) trova_contatto_equivalente: regola di riuso estratta da crea_o_riusa_contatto_in_soggetto
CREATE OR REPLACE FUNCTION public.trova_contatto_equivalente(_cliente_id uuid, _lead_id uuid, _nome text, _cognome text, _email text, _cellulare text, _codice_fiscale text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text := nullif(btrim(_nome), '');
  v_cognome text := nullif(btrim(_cognome), '');
  v_email text := nullif(btrim(_email), '');
  v_cellulare text := nullif(btrim(_cellulare), '');
  v_codice_fiscale text := nullif(upper(btrim(_codice_fiscale)), '');
  v_id uuid;
BEGIN
  IF v_nome IS NULL OR v_cognome IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_id
  FROM public.contatti c
  WHERE ((_cliente_id IS NOT NULL AND c.cliente_id = _cliente_id)
      OR (_lead_id IS NOT NULL AND c.lead_id = _lead_id))
    AND lower(btrim(coalesce(c.nome,''))) = lower(v_nome)
    AND lower(btrim(coalesce(c.cognome,''))) = lower(v_cognome)
    AND (
      (v_email IS NOT NULL AND lower(btrim(coalesce(c.email,''))) = lower(v_email))
      OR (v_cellulare IS NOT NULL AND public.normalizza_numero_it(c.cellulare) IS NOT NULL
          AND public.normalizza_numero_it(c.cellulare) = public.normalizza_numero_it(v_cellulare))
      OR (v_codice_fiscale IS NOT NULL AND upper(btrim(coalesce(c.codice_fiscale,''))) = v_codice_fiscale)
    )
  ORDER BY c.privacy_firmata DESC, c.principale DESC, c.created_at ASC
  LIMIT 1;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trova_contatto_equivalente(uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trova_contatto_equivalente(uuid,uuid,text,text,text,text,text) TO service_role;
COMMENT ON FUNCTION public.trova_contatto_equivalente(uuid,uuid,text,text,text,text,text) IS 'FM38: FONTE UNICA della regola "stessa persona già presente tra i contatti del soggetto". Usata da crea_o_riusa_contatto_in_soggetto e collega_lead_a_cliente.';

-- 2) crea_o_riusa_contatto_in_soggetto: il blocco di riuso delega a trova_contatto_equivalente
CREATE OR REPLACE FUNCTION public.crea_o_riusa_contatto_in_soggetto(_cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _email text DEFAULT NULL::text, _cellulare text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text)
 RETURNS TABLE(contatto_id uuid, riusato boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := nullif(btrim(_nome), '');
  v_cognome text := nullif(btrim(_cognome), '');
  v_email text := nullif(btrim(_email), '');
  v_cellulare text := nullif(btrim(_cellulare), '');
  v_codice_fiscale text := nullif(upper(btrim(_codice_fiscale)), '');
  v_cliente_id uuid := _cliente_id;
  v_lead_id uuid := _lead_id;
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (v_uid IS NULL OR NOT public.has_eventi_flusso_access(v_uid)) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  -- XOR: esattamente uno tra cliente e lead
  IF (v_cliente_id IS NOT NULL AND v_lead_id IS NOT NULL)
     OR (v_cliente_id IS NULL AND v_lead_id IS NULL) THEN
    RAISE EXCEPTION 'Specificare uno tra cliente o lead';
  END IF;

  IF v_nome IS NULL OR v_cognome IS NULL THEN
    RAISE EXCEPTION 'Nome e cognome obbligatori';
  END IF;

  -- Riuso: stesso soggetto, STESSA persona (nome+cognome e almeno un dato coincidente)
  v_id := public.trova_contatto_equivalente(v_cliente_id, v_lead_id, v_nome, v_cognome, v_email, v_cellulare, v_codice_fiscale);

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  INSERT INTO public.contatti (
    cliente_id, lead_id, nome, cognome, email, cellulare, codice_fiscale, ruolo, principale
  ) VALUES (
    v_cliente_id,
    v_lead_id,
    v_nome,
    v_cognome,
    v_email,
    v_cellulare,
    v_codice_fiscale,
    CASE WHEN v_cliente_id IS NOT NULL THEN 'Referente' ELSE NULL END,
    false
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, false;
END;
$function$;

-- 3) trasferisci_privacy_contatto: passaggio di consensi e privacy firmata tra contatti
CREATE OR REPLACE FUNCTION public.trasferisci_privacy_contatto(_da uuid, _a uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cli uuid;
  v_lead uuid;
BEGIN
  IF _da IS NULL OR _a IS NULL OR _da = _a THEN
    RETURN;
  END IF;

  SELECT cliente_id, lead_id INTO v_cli, v_lead FROM public.contatti WHERE id = _a;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.consensi_log
     SET cliente_id = v_cli,
         lead_id = CASE WHEN v_cli IS NOT NULL THEN NULL ELSE v_lead END,
         contatto_id = _a
   WHERE contatto_id = _da;

  UPDATE public.contatti d
     SET privacy_firmata = o.privacy_firmata,
         data_firma = o.data_firma,
         firma_url = o.firma_url,
         pdf_privacy_url = o.pdf_privacy_url,
         pdf_privacy_path = o.pdf_privacy_path,
         consenso_profilazione = o.consenso_profilazione,
         consenso_marketing_media = o.consenso_marketing_media,
         consenso_marketing_diretto = o.consenso_marketing_diretto
    FROM public.contatti o
   WHERE d.id = _a AND o.id = _da
     AND o.privacy_firmata = true AND d.privacy_firmata = false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trasferisci_privacy_contatto(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trasferisci_privacy_contatto(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.trasferisci_privacy_contatto(uuid,uuid) IS 'FM38: FONTE UNICA del passaggio di consensi e privacy firmata da un contatto a un altro (la privacy segue la persona; mai sovrascritta una privacy già firmata). Usata da riconcilia_partecipante e collega_lead_a_cliente.';

-- 4) riconcilia_partecipante: il blocco privacy delega a trasferisci_privacy_contatto
CREATE OR REPLACE FUNCTION public.riconcilia_partecipante(_partecipante_id uuid, _cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  p record;
  l public.lead%ROWTYPE;
  v_dest_cliente_id uuid;
  v_dest_lead_id uuid;
  v_contatto_id uuid;
  v_contatto_iniziale uuid;
  v_vecchio_lead uuid;
  v_grezzo boolean := false;
  v_cf text;
  v_email text;
  v_nome text;
  v_cognome text;
  v_cellulare text;
  v_n int;
  v_tipo text;
  v_id uuid;
  v_n_forti int;
  v_n_forti_rs int;
  v_n_solo_rs int;
  v_cand jsonb;
  v_motivi jsonb;
  v_regola text;
  v_avviso text;
  v_rs_dich text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (v_uid IS NULL OR NOT public.has_eventi_flusso_access(v_uid)) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti WHERE id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  IF p.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead WHERE id = p.lead_id;
    IF FOUND THEN
      v_grezzo := public.lead_evento_provvisorio(p.lead_id);
    END IF;
  END IF;

  IF p.cliente_id IS NOT NULL OR (p.lead_id IS NOT NULL AND NOT v_grezzo) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'gia_riconciliato');
  END IF;

  v_contatto_iniziale := p.contatto_id;

  -- destinazione
  IF _cliente_id IS NOT NULL THEN
    PERFORM 1 FROM public.clienti WHERE id = _cliente_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'cliente_non_trovato');
    END IF;
    v_dest_cliente_id := _cliente_id;
  ELSIF _lead_id IS NOT NULL THEN
    PERFORM 1 FROM public.lead WHERE id = _lead_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'lead_non_trovato');
    END IF;
    IF public.lead_evento_provvisorio(_lead_id) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'lead_non_valido');
    END IF;
    v_dest_lead_id := _lead_id;
  ELSE
    SELECT count(*) FILTER (WHERE cc.forte),
           count(*) FILTER (WHERE cc.forte AND 'Stessa ragione sociale' = ANY(cc.motivi)),
           count(*) FILTER (WHERE NOT cc.forte AND 'Stessa ragione sociale' = ANY(cc.motivi)),
           coalesce(jsonb_agg(jsonb_build_object('tipo', cc.tipo, 'id', cc.id, 'etichetta', cc.etichetta, 'forte', cc.forte, 'motivi', to_jsonb(cc.motivi))), '[]'::jsonb)
      INTO v_n_forti, v_n_forti_rs, v_n_solo_rs, v_cand
    FROM public.cerca_candidati_riconciliazione(_partecipante_id) cc;

    IF v_n_forti = 1 THEN
      v_regola := 'unico_forte';
      SELECT e->>'tipo', (e->>'id')::uuid, e->'motivi' INTO v_tipo, v_id, v_motivi
        FROM jsonb_array_elements(v_cand) e WHERE (e->>'forte')::boolean LIMIT 1;
    ELSIF v_n_forti > 1 AND v_n_forti_rs = 1 THEN
      v_regola := 'spareggio_impresa';
      SELECT e->>'tipo', (e->>'id')::uuid, e->'motivi' INTO v_tipo, v_id, v_motivi
        FROM jsonb_array_elements(v_cand) e WHERE (e->>'forte')::boolean AND (e->'motivi') ? 'Stessa ragione sociale' LIMIT 1;
    ELSIF v_n_forti = 0 AND v_n_solo_rs = 1 THEN
      v_regola := 'solo_impresa';
      SELECT e->>'tipo', (e->>'id')::uuid, e->'motivi' INTO v_tipo, v_id, v_motivi
        FROM jsonb_array_elements(v_cand) e WHERE NOT (e->>'forte')::boolean AND (e->'motivi') ? 'Stessa ragione sociale' LIMIT 1;
    ELSE
      RETURN jsonb_build_object('ok', false, 'errore', 'match_non_univoco', 'n', v_n_forti,
        'motivo', CASE WHEN jsonb_array_length(v_cand) = 0 THEN 'nessun_candidato'
                       WHEN v_n_forti = 0 THEN 'piu_imprese_omonime'
                       ELSE 'piu_candidati' END,
        'candidati', v_cand);
    END IF;

    IF v_tipo = 'cliente' THEN
      v_dest_cliente_id := v_id;
    ELSE
      v_dest_lead_id := v_id;
    END IF;

    v_rs_dich := nullif(btrim(coalesce(p.ragione_sociale, l.ragione_sociale)), '');
    IF v_regola = 'unico_forte' AND v_rs_dich IS NOT NULL AND NOT (v_motivi ? 'Stessa ragione sociale') THEN
      v_avviso := 'impresa_dichiarata_diversa';
    END IF;
  END IF;

  -- dati anagrafici con fallback
  v_cf   := nullif(upper(btrim(coalesce(p.codice_fiscale, l.codice_fiscale))), '');
  v_email := nullif(lower(btrim(coalesce(p.email, l.email))), '');
  v_nome := nullif(btrim(coalesce(p.nome, l.nome)), '');
  v_cognome := nullif(btrim(coalesce(p.cognome, l.cognome)), '');
  v_cellulare := nullif(btrim(coalesce(l.cellulare, CASE WHEN p.origine = 'iscrizione_online' THEN p.telefono END)), '');
  IF v_cf IN ('102730','102729') THEN v_cf := NULL; END IF;

  IF (v_nome IS NULL OR v_cognome IS NULL OR v_email IS NULL OR v_cellulare IS NULL OR v_cf IS NULL)
     AND v_contatto_iniziale IS NOT NULL THEN
    SELECT nullif(btrim(coalesce(v_nome, ct.nome)), ''),
           nullif(btrim(coalesce(v_cognome, ct.cognome)), ''),
           coalesce(v_email, nullif(lower(btrim(ct.email)), '')),
           coalesce(v_cellulare, nullif(btrim(ct.cellulare), '')),
           coalesce(v_cf, nullif(upper(btrim(ct.codice_fiscale)), ''))
      INTO v_nome, v_cognome, v_email, v_cellulare, v_cf
    FROM public.contatti ct WHERE ct.id = v_contatto_iniziale;
  END IF;

  v_contatto_id := v_contatto_iniziale;

  IF v_nome IS NOT NULL AND v_cognome IS NOT NULL THEN
    SELECT r.contatto_id INTO v_contatto_id
    FROM public.crea_o_riusa_contatto_in_soggetto(
      _cliente_id := v_dest_cliente_id,
      _lead_id := v_dest_lead_id,
      _nome := v_nome,
      _cognome := v_cognome,
      _email := v_email,
      _cellulare := v_cellulare,
      _codice_fiscale := v_cf
    ) r;
    v_contatto_id := coalesce(v_contatto_id, v_contatto_iniziale);
  END IF;

  IF v_contatto_iniziale IS NOT NULL AND v_contatto_iniziale IS DISTINCT FROM v_contatto_id THEN
    PERFORM public.trasferisci_privacy_contatto(v_contatto_iniziale, v_contatto_id);
  END IF;

  IF v_contatto_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.get_stato_consensi(ARRAY[v_contatto_id]) sc WHERE sc.whatsapp) THEN
    BEGIN
      PERFORM public.upsert_iscritto_da_contatto(v_contatto_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_grezzo THEN
    v_vecchio_lead := p.lead_id;
  END IF;

  UPDATE public.eventi_partecipanti
     SET cliente_id = COALESCE(v_dest_cliente_id, cliente_id),
         lead_id = CASE
                     WHEN v_dest_lead_id IS NOT NULL THEN v_dest_lead_id
                     WHEN v_dest_cliente_id IS NOT NULL AND v_vecchio_lead IS NOT NULL THEN NULL
                     ELSE lead_id
                   END,
         contatto_id = COALESCE(v_contatto_id, contatto_id),
         riconciliato_il = now()
    WHERE id = _partecipante_id;

  IF v_vecchio_lead IS NOT NULL AND v_vecchio_lead IS DISTINCT FROM v_dest_lead_id THEN
    IF public.lead_evento_provvisorio(v_vecchio_lead)
       AND NOT EXISTS (SELECT 1 FROM public.eventi_partecipanti ep WHERE ep.lead_id = v_vecchio_lead AND ep.id <> _partecipante_id) THEN
      DELETE FROM public.contatti WHERE lead_id = v_vecchio_lead AND cliente_id IS NULL;
      DELETE FROM public.lead WHERE id = v_vecchio_lead;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true,
                            'cliente_id', v_dest_cliente_id,
                            'lead_id', v_dest_lead_id,
                            'contatto_id', v_contatto_id,
                            'modo', CASE WHEN _cliente_id IS NULL AND _lead_id IS NULL THEN 'auto' ELSE 'manuale' END,
                            'regola', v_regola,
                            'avviso', v_avviso);
END;
$function$;

-- 5) lead_evento_provvisorio: un lead collegato a un cliente non è provvisorio
CREATE OR REPLACE FUNCTION public.lead_evento_provvisorio(_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.lead l
     WHERE l.id = _lead_id
       AND l.fonte = 'evento'::public.lead_fonte
       AND l.ambito = 'eventi'
       AND l.cliente_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = l.id)
  );
$function$;

COMMENT ON FUNCTION public.lead_evento_provvisorio(uuid) IS 'FM38: lead da evento provvisorio = fonte evento, ambito eventi, non collegato a un cliente, senza opportunità/attività/richieste/cantieri. FONTE UNICA della regola.';