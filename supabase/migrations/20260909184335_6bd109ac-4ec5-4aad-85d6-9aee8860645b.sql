CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(
  _numero_raw text, _nome text DEFAULT NULL, _cognome text DEFAULT NULL,
  _email text DEFAULT NULL, _origine text DEFAULT 'link', _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL, _informativa_versione text DEFAULT NULL,
  _informativa_hash text DEFAULT NULL, _secondi_permanenza integer DEFAULT NULL,
  _azienda text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text; v_cli_cnt int; v_cli uuid; v_lead_cnt int; v_lead uuid;
  v_log_id uuid; v_stato text; v_esito text; v_origine_log text;
  v_isc_id uuid; v_contatto_id uuid;
BEGIN
  v_norm := public.normalizza_numero_it(_numero_raw);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'numero_non_valido');
  END IF;

  v_origine_log := CASE WHEN _origine = 'operatore' THEN 'operatore' ELSE 'link_pubblico' END;

  SELECT count(*) INTO v_cli_cnt
  FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = v_norm;
  IF v_cli_cnt = 1 THEN
    SELECT id INTO v_cli FROM public.clienti
    WHERE public.normalizza_numero_it(cellulare) = v_norm LIMIT 1;
  END IF;

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
      NULL, v_cli, v_lead, 'whatsapp', true, v_origine_log,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
      'Iscrizione WhatsApp (' || _origine || ')'
    ) RETURNING id INTO v_log_id;
  END IF;

  v_stato := CASE
    WHEN v_cli IS NOT NULL THEN 'collegato_cliente'
    WHEN v_lead IS NOT NULL THEN 'collegato_lead'
    ELSE 'nuovo' END;
  v_esito := CASE WHEN v_cli IS NOT NULL OR v_lead IS NOT NULL THEN 'collegato' ELSE 'in_lista' END;

  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, azienda, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _azienda, _origine, v_stato, v_cli, v_lead, v_log_id
  ) RETURNING id INTO v_isc_id;

  IF v_cli IS NOT NULL THEN
    v_contatto_id := public._crea_contatto_da_iscritto(v_isc_id, v_cli);
    IF v_contatto_id IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_contatto_id WHERE id = v_isc_id;
      IF v_log_id IS NOT NULL THEN
        UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = v_log_id;
      END IF;
    END IF;
    UPDATE public.clienti SET whatsapp = v_norm
    WHERE id = v_cli AND (whatsapp IS NULL OR btrim(whatsapp) = '');
  END IF;

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp(text, text, text, text, text, text, text, text, text, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp(text, text, text, text, text, text, text, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp(text, text, text, text, text, text, text, text, text, integer, text) TO service_role;

DO $$
DECLARE r record; v_cid uuid;
BEGIN
  FOR r IN
    SELECT id, cliente_id, consenso_log_id
    FROM public.iscritti_whatsapp
    WHERE stato = 'collegato_cliente' AND cliente_id IS NOT NULL AND contatto_id IS NULL
  LOOP
    v_cid := public._crea_contatto_da_iscritto(r.id, r.cliente_id);
    IF v_cid IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_cid WHERE id = r.id;
      IF r.consenso_log_id IS NOT NULL THEN
        UPDATE public.consensi_log SET contatto_id = v_cid WHERE id = r.consenso_log_id AND contatto_id IS NULL;
      END IF;
    END IF;
  END LOOP;
END $$;