CREATE OR REPLACE FUNCTION public.cerca_candidati_riconciliazione(_partecipante_id uuid)
 RETURNS TABLE(tipo text, id uuid, etichetta text, motivi text[], forte boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  p public.eventi_partecipanti%ROWTYPE;
  l public.lead%ROWTYPE;
  ct public.contatti%ROWTYPE;
  v_rs text;
  v_piva text;
  v_cf text;
  v_email text;
  v_cell text;
BEGIN
  v_uid := auth.uid();
  IF coalesce(auth.role(), '') <> 'service_role' AND (v_uid IS NULL OR NOT public.has_eventi_flusso_access(v_uid)) THEN
    RETURN;
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti ep WHERE ep.id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead le WHERE le.id = p.lead_id;
  END IF;
  IF p.contatto_id IS NOT NULL THEN
    SELECT * INTO ct FROM public.contatti co WHERE co.id = p.contatto_id;
  END IF;

  v_rs := public.normalizza_ragione_sociale(coalesce(p.ragione_sociale, l.ragione_sociale));
  v_piva := nullif(btrim(coalesce(p.partita_iva, l.partita_iva)), '');
  IF v_piva IN ('102730', '102729') THEN v_piva := NULL; END IF;
  v_cf := nullif(upper(btrim(coalesce(p.codice_fiscale, l.codice_fiscale))), '');
  IF v_cf IN ('102730', '102729') THEN v_cf := NULL; END IF;
  v_email := nullif(lower(btrim(coalesce(p.email, l.email, ct.email))), '');
  v_cell := public.normalizza_numero_it(coalesce(l.cellulare, ct.cellulare, p.telefono));

  IF v_rs IS NULL AND v_piva IS NULL AND v_cf IS NULL AND v_email IS NULL AND v_cell IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidati AS (
    -- clienti diretti
    SELECT 'cliente'::text AS tipo, c.id, c.ragione_sociale AS etichetta,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_piva IS NOT NULL AND btrim(c.partita_iva) = v_piva THEN 'Stessa partita IVA' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(c.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale' END,
             CASE WHEN v_email IS NOT NULL AND lower(btrim(c.email)) = v_email THEN 'Stessa email' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(c.cellulare) = v_cell THEN 'Stesso cellulare' END,
             CASE WHEN v_rs IS NOT NULL AND public.normalizza_ragione_sociale(c.ragione_sociale) = v_rs THEN 'Stessa ragione sociale' END
           ], NULL) AS motivi
    FROM public.clienti c
    -- clienti via contatti
    UNION ALL
    SELECT 'cliente'::text, ctc.cliente_id, cl.ragione_sociale,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_email IS NOT NULL AND lower(btrim(ctc.email)) = v_email THEN 'Stessa email (contatto)' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(ctc.cellulare) = v_cell THEN 'Stesso cellulare (contatto)' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(ctc.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale (contatto)' END
           ], NULL)
    FROM public.contatti ctc
    JOIN public.clienti cl ON cl.id = ctc.cliente_id
    WHERE ctc.cliente_id IS NOT NULL
      AND (
        (v_email IS NOT NULL AND lower(btrim(ctc.email)) = v_email)
        OR (v_cell IS NOT NULL AND public.normalizza_numero_it(ctc.cellulare) = v_cell)
        OR (v_cf IS NOT NULL AND upper(btrim(ctc.codice_fiscale)) = v_cf)
      )
    -- lead veri diretti
    UNION ALL
    SELECT 'lead'::text, l2.id, coalesce(l2.ragione_sociale, btrim(l2.nome || ' ' || l2.cognome)),
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_piva IS NOT NULL AND btrim(l2.partita_iva) = v_piva THEN 'Stessa partita IVA' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(l2.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale' END,
             CASE WHEN v_email IS NOT NULL AND lower(btrim(l2.email)) = v_email THEN 'Stessa email' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(l2.cellulare) = v_cell THEN 'Stesso cellulare' END,
             CASE WHEN v_rs IS NOT NULL AND public.normalizza_ragione_sociale(l2.ragione_sociale) = v_rs THEN 'Stessa ragione sociale' END
           ], NULL)
    FROM public.lead l2
    WHERE l2.id IS DISTINCT FROM p.lead_id
      AND NOT (
        l2.fonte = 'evento'
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri ca WHERE ca.lead_id = l2.id)
      )
    -- lead veri via contatti
    UNION ALL
    SELECT 'lead'::text, ctl.lead_id, coalesce(l3.ragione_sociale, btrim(l3.nome || ' ' || l3.cognome)),
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_email IS NOT NULL AND lower(btrim(ctl.email)) = v_email THEN 'Stessa email (contatto)' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(ctl.cellulare) = v_cell THEN 'Stesso cellulare (contatto)' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(ctl.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale (contatto)' END
           ], NULL)
    FROM public.contatti ctl
    JOIN public.lead l3 ON l3.id = ctl.lead_id
    WHERE ctl.lead_id IS NOT NULL
      AND ctl.lead_id IS DISTINCT FROM p.lead_id
      AND (
        (v_email IS NOT NULL AND lower(btrim(ctl.email)) = v_email)
        OR (v_cell IS NOT NULL AND public.normalizza_numero_it(ctl.cellulare) = v_cell)
        OR (v_cf IS NOT NULL AND upper(btrim(ctl.codice_fiscale)) = v_cf)
      )
      AND NOT (
        l3.fonte = 'evento'
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri ca WHERE ca.lead_id = l3.id)
      )
  ),
  filtrati AS (
    SELECT ca.tipo, ca.id, ca.etichetta, ca.motivi,
           (
             ca.motivi::text[] @> ARRAY['Stessa partita IVA']
             OR ca.motivi::text[] @> ARRAY['Stesso codice fiscale']
             OR ca.motivi::text[] @> ARRAY['Stessa email']
             OR ca.motivi::text[] @> ARRAY['Stesso cellulare']
             OR ca.motivi::text[] @> ARRAY['Stessa email (contatto)']
             OR ca.motivi::text[] @> ARRAY['Stesso cellulare (contatto)']
             OR ca.motivi::text[] @> ARRAY['Stesso codice fiscale (contatto)']
           ) AS forte
    FROM candidati ca
    WHERE array_length(ca.motivi, 1) IS NOT NULL
  ),
  aggregati AS (
    SELECT f.tipo, f.id, f.etichetta, bool_or(f.forte) AS forte
    FROM filtrati f
    GROUP BY f.tipo, f.id, f.etichetta
  ),
  finali AS (
    SELECT a.tipo, a.id, a.etichetta, a.forte,
           (SELECT array_agg(DISTINCT m)
            FROM filtrati f2, LATERAL unnest(f2.motivi) u(m)
            WHERE f2.tipo = a.tipo AND f2.id = a.id) AS motivi
    FROM aggregati a
  )
  SELECT fi.tipo, fi.id, fi.etichetta, fi.motivi, fi.forte
  FROM finali fi
  ORDER BY fi.forte DESC, cardinality(fi.motivi) DESC;
END;
$function$;

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
  SELECT c.id INTO v_id
  FROM public.contatti c
  WHERE ((v_cliente_id IS NOT NULL AND c.cliente_id = v_cliente_id)
      OR (v_lead_id IS NOT NULL AND c.lead_id = v_lead_id))
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

REVOKE EXECUTE ON FUNCTION public.crea_o_riusa_contatto_in_soggetto(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crea_o_riusa_contatto_in_soggetto(uuid, uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cerca_candidati_riconciliazione(uuid) TO service_role;

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
      v_grezzo := (l.fonte = 'evento'::lead_fonte)
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = p.lead_id);
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
    IF EXISTS (
      SELECT 1 FROM public.lead l2
      WHERE l2.id = _lead_id AND l2.fonte = 'evento'::lead_fonte
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = l2.id)
    ) THEN
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
    UPDATE public.consensi_log
       SET cliente_id = CASE WHEN v_dest_cliente_id IS NOT NULL THEN v_dest_cliente_id ELSE NULL END,
           lead_id = CASE WHEN v_dest_cliente_id IS NOT NULL THEN NULL ELSE v_dest_lead_id END,
           contatto_id = COALESCE(v_contatto_id, contatto_id)
     WHERE contatto_id = v_contatto_iniziale;

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
     WHERE d.id = v_contatto_id AND o.id = v_contatto_iniziale
       AND o.privacy_firmata = true AND d.privacy_firmata = false;
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
    IF EXISTS (
      SELECT 1 FROM public.lead l3
      WHERE l3.id = v_vecchio_lead AND l3.fonte = 'evento'::lead_fonte
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.eventi_partecipanti ep WHERE ep.lead_id = l3.id AND ep.id <> _partecipante_id)
    ) THEN
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

GRANT EXECUTE ON FUNCTION public.riconcilia_partecipante(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.riconcilia_partecipante(uuid, uuid, uuid) IS 'FM38: automatico con regole unico_forte / spareggio_impresa / solo_impresa (una sola ricerca candidati); service_role ammesso; la privacy firmata segue la persona sul contatto di destinazione; iscritto WhatsApp solo con consenso nel registro.';