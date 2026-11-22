CREATE OR REPLACE FUNCTION public.completa_dati_lead_esportazione_gamma(
  _ordine_id uuid, _listino smallint, _macrocategoria text, _categoria text, _codice_sdi text,
  _anagrafica jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE
  v_lead_id uuid;
  v_dati jsonb := COALESCE(_anagrafica, '{}'::jsonb);
BEGIN
  -- Il gate canonico controlla ruolo, visibilita, tipo/lead ed export e blocca la testata FOR UPDATE.
  -- La chiamata e l'UPDATE sotto sono nella medesima transazione: ogni errore annulla entrambi.
  PERFORM public.completa_dati_esportazione_gamma(_ordine_id, _listino,
    CASE WHEN _macrocategoria IS NULL THEN NULL ELSE NULLIF(btrim(_macrocategoria), '') END,
    CASE WHEN _categoria IS NULL THEN NULL ELSE NULLIF(btrim(_categoria), '') END,
    CASE WHEN _codice_sdi IS NULL THEN NULL ELSE btrim(_codice_sdi) END);
  IF jsonb_typeof(v_dati) <> 'object' THEN RAISE EXCEPTION 'Dati anagrafici non validi'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(v_dati) e WHERE e.key <> ALL(ARRAY[
    'ragione_sociale','nome','cognome','partita_iva','codice_fiscale','indirizzo','cap','citta','provincia',
    'telefono','cellulare','email','tipo_soggetto']) OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'Campo anagrafico non ammesso';
  END IF;
  SELECT lead_id INTO v_lead_id FROM public.preventivi WHERE id = _ordine_id;
  UPDATE public.lead SET
    ragione_sociale = CASE WHEN v_dati->>'ragione_sociale' IS NULL THEN ragione_sociale ELSE NULLIF(btrim(v_dati->>'ragione_sociale'), '') END,
    nome = CASE WHEN v_dati->>'nome' IS NULL THEN nome ELSE NULLIF(btrim(v_dati->>'nome'), '') END,
    cognome = CASE WHEN v_dati->>'cognome' IS NULL THEN cognome ELSE NULLIF(btrim(v_dati->>'cognome'), '') END,
    partita_iva = CASE WHEN v_dati->>'partita_iva' IS NULL THEN partita_iva ELSE NULLIF(btrim(v_dati->>'partita_iva'), '') END,
    codice_fiscale = CASE WHEN v_dati->>'codice_fiscale' IS NULL THEN codice_fiscale ELSE NULLIF(btrim(v_dati->>'codice_fiscale'), '') END,
    indirizzo = CASE WHEN v_dati->>'indirizzo' IS NULL THEN indirizzo ELSE NULLIF(btrim(v_dati->>'indirizzo'), '') END,
    cap = CASE WHEN v_dati->>'cap' IS NULL THEN cap ELSE NULLIF(btrim(v_dati->>'cap'), '') END,
    citta = CASE WHEN v_dati->>'citta' IS NULL THEN citta ELSE NULLIF(btrim(v_dati->>'citta'), '') END,
    provincia = CASE WHEN v_dati->>'provincia' IS NULL THEN provincia ELSE NULLIF(btrim(v_dati->>'provincia'), '') END,
    telefono = CASE WHEN v_dati->>'telefono' IS NULL THEN telefono ELSE NULLIF(btrim(v_dati->>'telefono'), '') END,
    cellulare = CASE WHEN v_dati->>'cellulare' IS NULL THEN cellulare ELSE NULLIF(btrim(v_dati->>'cellulare'), '') END,
    email = CASE WHEN v_dati->>'email' IS NULL THEN email ELSE NULLIF(btrim(v_dati->>'email'), '') END,
    tipo_soggetto = CASE WHEN v_dati->>'tipo_soggetto' IS NULL THEN tipo_soggetto ELSE NULLIF(btrim(v_dati->>'tipo_soggetto'), '') END
  WHERE id = v_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead dell''ordine non disponibile'; END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb) IS 'FM97: completa atomico ordine e solo lead collegato; JSON null/assente invariato, stringa vuota NULL. Riusa il gate Gamma precedente senza alterarne firma o ACL.';