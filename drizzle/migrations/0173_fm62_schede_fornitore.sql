CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL, _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, origine text, codice_gestionale int, ragione_sociale text, alias text, partita_iva text, codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean, n_articoli int, n_preferenziale int, anche_cliente boolean, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH conteggi AS MATERIALIZED (
    SELECT af.fornitore_id, count(*)::int AS n_articoli,
      count(*) FILTER (WHERE af.preferenziale)::int AS n_preferenziale
    FROM public.articoli_gamma_fornitori af
    JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo
    GROUP BY af.fornitore_id
  ), base AS (
    SELECT f.id, f.origine, f.codice_gestionale,
      coalesce(f.ragione_sociale, f.nome) AS ragione_sociale,
      f.alias, f.partita_iva, f.codice_fiscale, f.citta, f.provincia,
      f.condizione_pagamento_desc, f.persona_fisica, f.valida,
      coalesce(c.n_articoli, 0) AS n_articoli, coalesce(c.n_preferenziale, 0) AS n_preferenziale,
      EXISTS (SELECT 1 FROM public.fornitore_cliente fc WHERE fc.fornitore_id = f.id) AS anche_cliente
    FROM public.fornitori f LEFT JOIN conteggi c ON c.fornitore_id = f.id
    WHERE ((f.origine = 'gamma' AND f.attivo) OR (coalesce(_includi_manuali, false) AND f.origine = 'manuale'))
      AND (nullif(btrim(_testo), '') IS NULL OR
        f.ragione_sociale ILIKE '%' || btrim(_testo) || '%' OR
        f.nome ILIKE '%' || btrim(_testo) || '%' OR
        f.alias ILIKE '%' || btrim(_testo) || '%' OR
        f.codice_gestionale::text ILIKE '%' || btrim(_testo) || '%' OR
        f.partita_iva ILIKE '%' || btrim(_testo) || '%' OR
        f.codice_fiscale ILIKE '%' || btrim(_testo) || '%' OR
        f.citta ILIKE '%' || btrim(_testo) || '%')
  )
  SELECT b.*, count(*) OVER () FROM base b
  WHERE (_anche_cliente IS NULL OR b.anche_cliente = _anche_cliente)
    AND (_con_articoli IS NULL OR (b.n_articoli > 0) = _con_articoli)
  ORDER BY b.ragione_sociale, b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text,boolean,boolean,boolean,int,int) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text,boolean,boolean,boolean,int,int) TO authenticated;

CREATE FUNCTION public.dettaglio_fornitore(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE risultato jsonb;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'id', f.id, 'origine', f.origine, 'codice_gestionale', f.codice_gestionale,
    'codice_anagrafica_generale', f.codice_anagrafica_generale, 'codice_cliente_gamma', f.codice_cliente_gamma,
    'ragione_sociale', coalesce(f.ragione_sociale, f.nome), 'alias', f.alias,
    'partita_iva', f.partita_iva, 'codice_fiscale', f.codice_fiscale, 'indirizzo', f.indirizzo,
    'cap', f.cap, 'citta', f.citta, 'provincia', f.provincia, 'stato', f.stato,
    'telefono', f.telefono, 'telefono_2', f.telefono_2, 'cellulare', f.cellulare, 'fax', f.fax,
    'email', f.email, 'sito', f.sito, 'pec', f.pec, 'persona_fisica', f.persona_fisica,
    'valida', f.valida, 'condizione_pagamento_cod', f.condizione_pagamento_cod,
    'condizione_pagamento_desc', f.condizione_pagamento_desc, 'attivo', f.attivo, 'note', f.note,
    'ultima_modifica_gamma', f.ultima_modifica_gamma, 'ultima_sincronizzazione', f.ultima_sincronizzazione,
    'clienti', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'cliente_id', c.id, 'codice_gestionale', c.codice_gestionale, 'ragione_sociale', c.ragione_sociale,
      'store_nome', s.nome, 'bloccato', c.bloccato, 'in_gestione_legale', c.in_gestione_legale,
      'origine_legame', fc.origine, 'coincide_su', fc.coincide_su
    ) ORDER BY c.ragione_sociale, c.id)
    FROM public.fornitore_cliente fc JOIN public.clienti c ON c.id = fc.cliente_id
    LEFT JOIN public.stores s ON s.id = c.store_id WHERE fc.fornitore_id = f.id), '[]'::jsonb),
    'n_articoli', (SELECT count(*)::int FROM public.articoli_gamma_fornitori af
      JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo WHERE af.fornitore_id = f.id),
    'n_preferenziale', (SELECT count(*)::int FROM public.articoli_gamma_fornitori af
      JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo WHERE af.fornitore_id = f.id AND af.preferenziale),
    'puo_modificare_note', public.auth_puo_gestire_anagrafiche_prev()
  ) INTO risultato FROM public.fornitori f WHERE f.id = _id;
  RETURN risultato;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) TO authenticated;

CREATE FUNCTION public.articoli_fornitore(_fornitore_id uuid, _testo text DEFAULT NULL, _solo_preferenziali boolean DEFAULT false, _limite int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE(codice text, descrizione text, marca text, famiglia text, stato_gamma text, codice_articolo_fornitore text, preferenziale boolean, costo_ultimo numeric, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT a.codice, a.descrizione, m.descrizione, a.famiglia, a.stato_gamma,
    af.codice_articolo_fornitore, af.preferenziale, a.costo_ultimo, count(*) OVER ()
  FROM public.articoli_gamma_fornitori af
  JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo
  LEFT JOIN public.marche m ON m.codice = a.marca_codice
  WHERE af.fornitore_id = _fornitore_id
    AND (NOT coalesce(_solo_preferenziali, false) OR af.preferenziale)
    AND (nullif(btrim(_testo), '') IS NULL OR a.codice ILIKE '%' || btrim(_testo) || '%'
      OR a.descrizione ILIKE '%' || btrim(_testo) || '%'
      OR af.codice_articolo_fornitore ILIKE '%' || btrim(_testo) || '%')
  ORDER BY af.preferenziale DESC, a.descrizione, a.codice
  LIMIT greatest(1, least(coalesce(_limite, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.articoli_fornitore(uuid,text,boolean,int,int) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.articoli_fornitore(uuid,text,boolean,int,int) TO authenticated;

CREATE FUNCTION public.aggiorna_note_fornitore(_id uuid, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.auth_puo_gestire_anagrafiche_prev(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF char_length(_note) > 4000 THEN
    RAISE EXCEPTION 'Le note interne possono contenere al massimo 4000 caratteri' USING ERRCODE = '22001';
  END IF;
  UPDATE public.fornitori SET note = nullif(btrim(_note), ''), updated_at = now() WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornitore non trovato' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_note_fornitore(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.aggiorna_note_fornitore(uuid,text) TO authenticated;