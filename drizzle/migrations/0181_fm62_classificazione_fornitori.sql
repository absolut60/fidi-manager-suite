-- FM62 F6: classificazione merci/servizi. Comanda Gamma (macrocategoria 01/03), altrimenti l'app.

ALTER TABLE public.fornitori ADD COLUMN tipo_app text CHECK (tipo_app IN ('merci', 'servizi'));
ALTER TABLE public.fornitori ADD COLUMN tipo_app_da uuid;
ALTER TABLE public.fornitori ADD COLUMN tipo_app_il timestamptz;
COMMENT ON COLUMN public.fornitori.tipo_app IS 'FM62 F6: tipo deciso nell''app (merci/servizi), usato solo se Gamma non ha la macrocategoria 01/03.';
COMMENT ON COLUMN public.fornitori.categoria_fornitore IS 'SUPERATO (FM62 F6): campo vecchio scritto dall''import, non usarlo per i fornitori Gamma. Per i manuali è solo il valore di partenza di public.tipo_fornitore_effettivo (materiali=merci, servizi=servizi).';

-- Fonte unica del tipo effettivo, usata da tutte le RPC fornitori.
CREATE OR REPLACE FUNCTION public.tipo_fornitore_effettivo(f public.fornitori)
RETURNS TABLE(tipo text, fonte text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
      WHEN btrim(f.macrocategoria_cod) = '01' THEN 'merci'
      WHEN btrim(f.macrocategoria_cod) = '03' THEN 'servizi'
      WHEN f.tipo_app IN ('merci', 'servizi') THEN f.tipo_app
      WHEN f.origine = 'manuale' AND f.categoria_fornitore = 'materiali' THEN 'merci'
      WHEN f.origine = 'manuale' AND f.categoria_fornitore = 'servizi' THEN 'servizi'
      ELSE 'da_classificare' END,
    CASE
      WHEN btrim(f.macrocategoria_cod) IN ('01', '03') THEN 'gamma'
      WHEN f.tipo_app IN ('merci', 'servizi') THEN 'app'
      WHEN f.origine = 'manuale' AND f.categoria_fornitore IN ('materiali', 'servizi') THEN 'app'
      ELSE 'nessuna' END;
$$;
REVOKE EXECUTE ON FUNCTION public.tipo_fornitore_effettivo(public.fornitori) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tipo_fornitore_effettivo(public.fornitori) TO authenticated, service_role;

DROP FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean);
DROP FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean);
DROP FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean);

-- Base filtrata unica per elenco e selezione (nessun controllo accesso: lo fanno i chiamanti).
CREATE FUNCTION public._fornitori_filtrati(
  _testo text, _anche_cliente boolean, _con_articoli boolean, _includi_manuali boolean,
  _macrocategorie text[], _con_email boolean, _tipi text[])
RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text,
  codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean,
  n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, email text,
  tipo_effettivo text, tipo_fonte text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      EXISTS (SELECT 1 FROM public.fornitore_cliente fc WHERE fc.fornitore_id = f.id) AS anche_cliente,
      nullif(btrim(f.macrocategoria_cod), '') AS macrocategoria_cod, nullif(btrim(f.macrocategoria_desc), '') AS macrocategoria_desc,
      CASE WHEN btrim(f.email) ~* '^[^@\s;,]+@[^@\s;,]+\.[a-z]{2,}$' THEN btrim(f.email) END AS email,
      te.tipo AS tipo_effettivo, te.fonte AS tipo_fonte
    FROM public.fornitori f
    LEFT JOIN conteggi c ON c.fornitore_id = f.id
    CROSS JOIN LATERAL public.tipo_fornitore_effettivo(f) te
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
  SELECT b.* FROM base b
  WHERE (_anche_cliente IS NULL OR b.anche_cliente = _anche_cliente)
    AND (_con_articoli IS NULL OR (b.n_articoli > 0) = _con_articoli)
    AND (_con_email IS NULL OR (b.email IS NOT NULL) = _con_email)
    AND (_macrocategorie IS NULL OR cardinality(_macrocategorie) = 0
      OR b.macrocategoria_cod = ANY(_macrocategorie)
      OR ('nd' = ANY(_macrocategorie) AND b.macrocategoria_cod IS NULL))
    AND (_tipi IS NULL OR cardinality(_tipi) = 0 OR b.tipo_effettivo = ANY(_tipi));
$$;
REVOKE EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean, text[]) TO service_role;

CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL,
  _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite integer DEFAULT 100,
  _offset integer DEFAULT 0, _macrocategorie text[] DEFAULT NULL, _con_email boolean DEFAULT NULL, _tipi text[] DEFAULT NULL)
RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text,
  codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean,
  n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text,
  email text, tipo_effettivo text, tipo_fonte text, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.*, count(*) OVER ()
  FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email, _tipi) b
  ORDER BY b.ragione_sociale, b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[]) TO authenticated, service_role;

CREATE FUNCTION public.cerca_fornitori_ids(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL,
  _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _macrocategorie text[] DEFAULT NULL,
  _con_email boolean DEFAULT NULL, _tipi text[] DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT array_agg(b.id ORDER BY b.ragione_sociale, b.id)
    FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email, _tipi) b), '{}');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dettaglio_fornitore(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE risultato jsonb;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
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
    'macrocategoria_cod', nullif(btrim(f.macrocategoria_cod), ''), 'macrocategoria_desc', nullif(btrim(f.macrocategoria_desc), ''),
    'tipo_effettivo', te.tipo, 'tipo_fonte', te.fonte, 'tipo_app_il', f.tipo_app_il,
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
    'puo_modificare_note', coalesce(public.auth_puo_gestire_fornitori(), false),
    'puo_vedere_articoli', coalesce(public.auth_ha_accesso_preventivi(), false)
  ) INTO risultato FROM public.fornitori f CROSS JOIN LATERAL public.tipo_fornitore_effettivo(f) te WHERE f.id = _id;
  RETURN risultato;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) TO authenticated, service_role;

-- Classificazione in blocco: scrive tipo_app solo dove Gamma non decide (01/03); gli altri li salta e li conta.
CREATE OR REPLACE FUNCTION public.classifica_fornitori(_ids uuid[], _tipo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agg int := 0; v_gamma int := 0; v_tot int := coalesce(cardinality(_ids), 0);
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_puo_gestire_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF _tipo IS NULL OR _tipo NOT IN ('merci', 'servizi') THEN RAISE EXCEPTION 'Tipo non valido'; END IF;
  IF v_tot = 0 THEN RETURN jsonb_build_object('aggiornati', 0, 'saltati_gamma', 0, 'non_trovati', 0); END IF;
  IF v_tot > 5000 THEN RAISE EXCEPTION 'Massimo 5000 fornitori per volta'; END IF;
  SELECT count(*) INTO v_gamma FROM public.fornitori f WHERE f.id = ANY(_ids) AND btrim(f.macrocategoria_cod) IN ('01', '03');
  UPDATE public.fornitori f SET tipo_app = _tipo, tipo_app_da = auth.uid(), tipo_app_il = now()
  WHERE f.id = ANY(_ids) AND coalesce(btrim(f.macrocategoria_cod), '') NOT IN ('01', '03');
  GET DIAGNOSTICS v_agg = ROW_COUNT;
  RETURN jsonb_build_object('aggiornati', v_agg, 'saltati_gamma', v_gamma,
    'non_trovati', greatest(0, (SELECT count(DISTINCT x) FROM unnest(_ids) x) - v_agg - v_gamma));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.classifica_fornitori(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_fornitori(uuid[], text) TO authenticated, service_role;