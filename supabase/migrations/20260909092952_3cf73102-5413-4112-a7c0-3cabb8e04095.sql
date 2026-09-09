CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(
  _numero_raw text, _nome text DEFAULT NULL, _cognome text DEFAULT NULL, _email text DEFAULT NULL,
  _origine text DEFAULT 'link', _ip text DEFAULT NULL, _user_agent text DEFAULT NULL,
  _informativa_versione text DEFAULT NULL, _informativa_hash text DEFAULT NULL, _secondi_permanenza int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text; v_cli_cnt int; v_cli uuid; v_lead_cnt int; v_lead uuid;
  v_log_id uuid; v_stato text; v_esito text;
BEGIN
  v_norm := public.normalizza_numero_it(_numero_raw);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'numero_non_valido');
  END IF;

  -- match univoco su clienti
  SELECT count(*) INTO v_cli_cnt
  FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = v_norm;
  IF v_cli_cnt = 1 THEN
    SELECT id INTO v_cli FROM public.clienti
    WHERE public.normalizza_numero_it(cellulare) = v_norm LIMIT 1;
  END IF;

  -- match univoco su lead (solo se nessun cliente trovato)
  IF v_cli IS NULL THEN
    SELECT count(*) INTO v_lead_cnt
    FROM public.lead WHERE public.normalizza_numero_it(cellulare) = v_norm;
    IF v_lead_cnt = 1 THEN
      SELECT id INTO v_lead FROM public.lead
      WHERE public.normalizza_numero_it(cellulare) = v_norm LIMIT 1;
    END IF;
  END IF;

  IF v_cli IS NOT NULL OR v_lead IS NOT NULL THEN
    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'whatsapp', true, _origine,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza, 'Iscrizione WhatsApp'
    ) RETURNING id INTO v_log_id;
  END IF;

  v_stato := CASE
    WHEN v_cli IS NOT NULL THEN 'collegato_cliente'
    WHEN v_lead IS NOT NULL THEN 'collegato_lead'
    ELSE 'nuovo' END;
  v_esito := CASE WHEN v_cli IS NOT NULL OR v_lead IS NOT NULL THEN 'collegato' ELSE 'in_lista' END;

  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _origine, v_stato, v_cli, v_lead, v_log_id
  );

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$$;