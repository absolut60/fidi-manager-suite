CREATE OR REPLACE FUNCTION public.crea_partecipante_da_nuovo_soggetto(
  _evento_id uuid,
  _stato eventi_partecipante_stato,
  _tipo_soggetto text,
  _ragione_sociale text DEFAULT NULL,
  _nome text DEFAULT NULL,
  _cognome text DEFAULT NULL,
  _partita_iva text DEFAULT NULL,
  _codice_fiscale text DEFAULT NULL,
  _email text DEFAULT NULL,
  _telefono text DEFAULT NULL,
  _cellulare text DEFAULT NULL,
  _indirizzo text DEFAULT NULL,
  _citta text DEFAULT NULL,
  _cap text DEFAULT NULL,
  _provincia text DEFAULT NULL,
  _note text DEFAULT NULL,
  _fonte_dettaglio text DEFAULT NULL,
  _crea_contatto boolean DEFAULT false
)
RETURNS TABLE(lead_id uuid, contatto_id uuid, partecipante_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_azienda boolean;
  v_lead_id uuid;
  v_contatto_id uuid;
  v_part_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  IF _tipo_soggetto NOT IN ('azienda','persona_fisica') THEN
    RAISE EXCEPTION 'Tipo soggetto non valido';
  END IF;
  v_azienda := (_tipo_soggetto = 'azienda');

  INSERT INTO public.lead (
    tipo_soggetto, ragione_sociale, nome, cognome, partita_iva, codice_fiscale,
    email, telefono, cellulare, indirizzo, citta, cap, provincia,
    fonte, fonte_dettaglio, tipo_lead, priorita, stato, note, created_by
  ) VALUES (
    _tipo_soggetto,
    CASE WHEN v_azienda THEN nullif(btrim(_ragione_sociale),'') ELSE NULL END,
    nullif(btrim(_nome),''), nullif(btrim(_cognome),''),
    nullif(btrim(_partita_iva),''), nullif(upper(btrim(_codice_fiscale)),''),
    nullif(lower(btrim(_email)),''), nullif(btrim(_telefono),''), nullif(btrim(_cellulare),''),
    nullif(btrim(_indirizzo),''), nullif(btrim(_citta),''), nullif(btrim(_cap),''), nullif(btrim(_provincia),''),
    'evento', nullif(btrim(_fonte_dettaglio),''),
    'potenziale_cliente', 'media', 'nuovo',
    nullif(btrim(_note),''), v_uid
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (v_lead_id, NULL, 'nuovo', v_uid, 'Lead creato dall''evento: ' || coalesce(_fonte_dettaglio,''));

  IF _crea_contatto AND nullif(btrim(_nome),'') IS NOT NULL THEN
    INSERT INTO public.contatti (
      lead_id, cliente_id, nome, cognome, email, telefono, cellulare, codice_fiscale, ruolo, principale
    ) VALUES (
      v_lead_id, NULL,
      btrim(_nome), nullif(btrim(_cognome),''),
      nullif(btrim(_email),''), nullif(btrim(_telefono),''), nullif(btrim(_cellulare),''),
      nullif(upper(btrim(_codice_fiscale)),''),
      CASE WHEN v_azienda THEN 'Referente' ELSE NULL END, false
    )
    RETURNING id INTO v_contatto_id;
  END IF;

  INSERT INTO public.eventi_partecipanti (
    evento_id, stato, lead_id, cliente_id, contatto_id,
    nome, cognome, ragione_sociale, partita_iva, codice_fiscale, email, telefono, note,
    registrato_sul_posto
  ) VALUES (
    _evento_id, _stato, v_lead_id, NULL, v_contatto_id,
    nullif(btrim(_nome),''), nullif(btrim(_cognome),''),
    CASE WHEN v_azienda THEN nullif(btrim(_ragione_sociale),'') ELSE NULL END,
    nullif(btrim(_partita_iva),''), nullif(btrim(_codice_fiscale),''),
    nullif(btrim(_email),''), nullif(btrim(_telefono),''),
    nullif(btrim(_note),''), true
  )
  RETURNING id INTO v_part_id;

  RETURN QUERY SELECT v_lead_id, v_contatto_id, v_part_id;
END;
$$;