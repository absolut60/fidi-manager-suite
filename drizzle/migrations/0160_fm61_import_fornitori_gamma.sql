CREATE OR REPLACE FUNCTION public.import_fornitori_gamma_lotto(_righe jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins integer := 0;
  v_upd integer := 0;
BEGIN
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(_righe) AS r(
      codice_gestionale integer, ragione_sociale text, alias text, valida boolean,
      indirizzo text, cap text, citta text, provincia text, stato text,
      partita_iva text, codice_fiscale text, persona_fisica boolean,
      telefono text, telefono_2 text, cellulare text, fax text, email text, sito text, pec text,
      condizione_pagamento_cod text, condizione_pagamento_desc text,
      ultima_modifica_gamma timestamptz, codice_anagrafica_generale integer, codice_cliente_gamma integer)
    WHERE codice_gestionale IS NOT NULL
  ), up AS (
    INSERT INTO public.fornitori AS f (
      nome, ragione_sociale, origine, categoria_fornitore, attivo, ultima_sincronizzazione,
      codice_gestionale, alias, valida, indirizzo, cap, citta, provincia, stato,
      partita_iva, codice_fiscale, persona_fisica, telefono, telefono_2, cellulare, fax,
      email, sito, pec, condizione_pagamento_cod, condizione_pagamento_desc,
      ultima_modifica_gamma, codice_anagrafica_generale, codice_cliente_gamma)
    SELECT COALESCE(s.ragione_sociale, 'Fornitore ' || s.codice_gestionale), s.ragione_sociale, 'gamma', 'materiali', true, now(),
      s.codice_gestionale, s.alias, s.valida, s.indirizzo, s.cap, s.citta, s.provincia, s.stato,
      s.partita_iva, s.codice_fiscale, s.persona_fisica, s.telefono, s.telefono_2, s.cellulare, s.fax,
      s.email, s.sito, s.pec, s.condizione_pagamento_cod, s.condizione_pagamento_desc,
      s.ultima_modifica_gamma, s.codice_anagrafica_generale, s.codice_cliente_gamma
    FROM src s
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
      codice_cliente_gamma = EXCLUDED.codice_cliente_gamma
    WHERE f.origine = 'gamma'
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;
  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd);
END;
$$;

CREATE OR REPLACE FUNCTION public.disattiva_fornitori_gamma_assenti(_codici integer[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v integer;
BEGIN
  IF _codici IS NULL OR cardinality(_codici) = 0 THEN
    RAISE EXCEPTION 'Elenco codici vuoto: disattivazione annullata';
  END IF;
  UPDATE public.fornitori SET attivo = false
  WHERE origine = 'gamma' AND attivo = true AND codice_gestionale IS NOT NULL
    AND NOT (codice_gestionale = ANY (_codici));
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.disattiva_fornitori_gamma_assenti(integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disattiva_fornitori_gamma_assenti(integer[]) TO service_role;