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

  IF v_lead.conversione_tipo = 'contatto_cliente' THEN
    -- Il cliente esisteva già: NON va eliminato. Si scollega soltanto ciò che è ancora legato al lead.
    UPDATE public.contatti SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.cantieri SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.opportunita SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.consensi_log SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.eventi_partecipanti SET cliente_id = NULL, riconciliato_il = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.lead SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'nuovo', conversione_tipo = NULL WHERE id = _lead_id;
    INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
    VALUES (_lead_id, 'convertito', 'nuovo', auth.uid(), 'Collegamento al cliente ' || v_cliente || ' annullato (il cliente non è stato toccato; eventuali contatti già uniti restano nel cliente)');
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