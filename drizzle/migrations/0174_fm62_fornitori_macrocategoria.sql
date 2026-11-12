ALTER TABLE public.fornitori ADD COLUMN IF NOT EXISTS macrocategoria_cod text;
ALTER TABLE public.fornitori ADD COLUMN IF NOT EXISTS macrocategoria_desc text;

CREATE OR REPLACE FUNCTION public.auth_ha_accesso_fornitori() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.auth_ha_accesso_preventivi() OR has_role(auth.uid(),'amministrazione');
$$;
REVOKE EXECUTE ON FUNCTION public.auth_ha_accesso_fornitori() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_ha_accesso_fornitori() TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_puo_gestire_fornitori() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(auth.uid(),'amministratore')
      OR has_role(auth.uid(),'preventivi_manage')
      OR has_role(auth.uid(),'amministrazione');
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_gestire_fornitori() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_gestire_fornitori() TO authenticated;

DROP FUNCTION public.cerca_fornitori(text,boolean,boolean,boolean,int,int);
CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL, _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite int DEFAULT 100, _offset int DEFAULT 0, _macrocategorie text[] DEFAULT NULL)
RETURNS TABLE(id uuid, origine text, codice_gestionale int, ragione_sociale text, alias text, partita_iva text, codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean, n_articoli int, n_preferenziale int, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
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
      EXISTS (SELECT 1 FROM public.fornitore_cliente fc WHERE fc.fornitore_id = f.id) AS anche_cliente,
      nullif(btrim(f.macrocategoria_cod), '') AS macrocategoria_cod, nullif(btrim(f.macrocategoria_desc), '') AS macrocategoria_desc
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
    AND (_macrocategorie IS NULL OR cardinality(_macrocategorie) = 0
      OR b.macrocategoria_cod = ANY(_macrocategorie)
      OR ('nd' = ANY(_macrocategorie) AND b.macrocategoria_cod IS NULL))
  ORDER BY b.ragione_sociale, b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text,boolean,boolean,boolean,int,int,text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text,boolean,boolean,boolean,int,int,text[]) TO authenticated;

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
  ) INTO risultato FROM public.fornitori f WHERE f.id = _id;
  RETURN risultato;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aggiorna_note_fornitore(_id uuid, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.auth_puo_gestire_fornitori(), false) THEN
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

CREATE OR REPLACE FUNCTION public.import_fornitori_gamma_lotto(_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ins integer := 0; v_upd integer := 0; v_inv integer := 0;
BEGIN
  CREATE TEMP TABLE _fg ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_righe) AS r(
      codice_gestionale integer, ragione_sociale text, alias text, valida boolean,
      indirizzo text, cap text, citta text, provincia text, stato text,
      partita_iva text, codice_fiscale text, persona_fisica boolean,
      telefono text, telefono_2 text, cellulare text, fax text, email text, sito text, pec text,
      condizione_pagamento_cod text, condizione_pagamento_desc text,
      ultima_modifica_gamma timestamptz, codice_anagrafica_generale integer, codice_cliente_gamma integer, macrocategoria_cod text, macrocategoria_desc text, hash_riga text)
  WHERE codice_gestionale IS NOT NULL;

  WITH inv AS (
    UPDATE public.fornitori f SET attivo = true, ultima_sincronizzazione = now()
    FROM _fg s
    WHERE f.codice_gestionale = s.codice_gestionale AND f.origine = 'gamma'
      AND s.hash_riga IS NOT NULL AND f.hash_riga = s.hash_riga
    RETURNING f.codice_gestionale
  ), del AS (
    DELETE FROM _fg s USING inv i WHERE s.codice_gestionale = i.codice_gestionale RETURNING 1
  )
  SELECT count(*) INTO v_inv FROM del;

  WITH up AS (
    INSERT INTO public.fornitori AS f (
      nome, ragione_sociale, origine, categoria_fornitore, attivo, ultima_sincronizzazione,
      codice_gestionale, alias, valida, indirizzo, cap, citta, provincia, stato,
      partita_iva, codice_fiscale, persona_fisica, telefono, telefono_2, cellulare, fax,
      email, sito, pec, condizione_pagamento_cod, condizione_pagamento_desc,
      ultima_modifica_gamma, codice_anagrafica_generale, codice_cliente_gamma, macrocategoria_cod, macrocategoria_desc, hash_riga)
    SELECT COALESCE(s.ragione_sociale, 'Fornitore ' || s.codice_gestionale), s.ragione_sociale, 'gamma', 'materiali', true, now(),
      s.codice_gestionale, s.alias, s.valida, s.indirizzo, s.cap, s.citta, s.provincia, s.stato,
      s.partita_iva, s.codice_fiscale, s.persona_fisica, s.telefono, s.telefono_2, s.cellulare, s.fax,
      s.email, s.sito, s.pec, s.condizione_pagamento_cod, s.condizione_pagamento_desc,
      s.ultima_modifica_gamma, s.codice_anagrafica_generale, s.codice_cliente_gamma, s.macrocategoria_cod, s.macrocategoria_desc, s.hash_riga
    FROM _fg s
    ON CONFLICT (codice_gestionale) DO UPDATE SET
      nome = EXCLUDED.nome, ragione_sociale = EXCLUDED.ragione_sociale,
      categoria_fornitore = 'materiali', attivo = true, ultima_sincronizzazione = now(),
      alias = EXCLUDED.alias, valida = EXCLUDED.valida, indirizzo = EXCLUDED.indirizzo, cap = EXCLUDED.cap,
      citta = EXCLUDED.citta, provincia = EXCLUDED.provincia, stato = EXCLUDED.stato,
      partita_iva = EXCLUDED.partita_iva, codice_fiscale = EXCLUDED.codice_fiscale,
      persona_fisica = EXCLUDED.persona_fisica, telefono = EXCLUDED.telefono, telefono_2 = EXCLUDED.telefono_2,
      cellulare = EXCLUDED.cellulare, fax = EXCLUDED.fax, email = EXCLUDED.email, sito = EXCLUDED.sito,
      pec = EXCLUDED.pec, condizione_pagamento_cod = EXCLUDED.condizione_pagamento_cod,
      condizione_pagamento_desc = EXCLUDED.condizione_pagamento_desc,
      ultima_modifica_gamma = EXCLUDED.ultima_modifica_gamma,
      codice_anagrafica_generale = EXCLUDED.codice_anagrafica_generale,
      codice_cliente_gamma = EXCLUDED.codice_cliente_gamma,
      macrocategoria_cod = EXCLUDED.macrocategoria_cod, macrocategoria_desc = EXCLUDED.macrocategoria_desc, hash_riga = EXCLUDED.hash_riga
    WHERE f.origine = 'gamma'
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;
  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'invariati', v_inv);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) TO service_role;