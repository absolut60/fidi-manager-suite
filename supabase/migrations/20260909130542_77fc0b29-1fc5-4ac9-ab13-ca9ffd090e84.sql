ALTER TABLE public.iscritti_whatsapp ADD COLUMN IF NOT EXISTS azienda text;

DROP FUNCTION IF EXISTS public.registra_consenso_whatsapp(text,text,text,text,text,text,text,text,text,integer);
DROP FUNCTION IF EXISTS public.export_iscritti_whatsapp(text,text,text);

CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(
  _numero_raw text,
  _nome text DEFAULT NULL,
  _cognome text DEFAULT NULL,
  _email text DEFAULT NULL,
  _origine text DEFAULT 'link',
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _informativa_versione text DEFAULT NULL,
  _informativa_hash text DEFAULT NULL,
  _secondi_permanenza integer DEFAULT NULL,
  _azienda text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_norm text; v_cli_cnt int; v_cli uuid; v_lead_cnt int; v_lead uuid;
  v_log_id uuid; v_stato text; v_esito text; v_origine_log text;
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
  );

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp(text,text,text,text,text,text,text,text,text,integer,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.export_iscritti_whatsapp(
  _stato text DEFAULT 'tutti',
  _origine text DEFAULT 'tutti',
  _q text DEFAULT NULL
)
RETURNS TABLE(
  numero text, nome text, cognome text, azienda text, email text, origine text, stato text,
  collegato_a text, data_iscrizione timestamptz, consenso_data timestamptz, consenso_origine text,
  informativa_versione text, informativa_hash text, ip_address text, user_agent text, secondi_permanenza integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(i.numero_raw, i.numero_norm) AS numero,
    i.nome, i.cognome, i.azienda, i.email, i.origine, i.stato,
    CASE WHEN i.cliente_id IS NOT NULL THEN 'Cliente'
         WHEN i.lead_id   IS NOT NULL THEN 'Lead'
         ELSE '' END AS collegato_a,
    i.created_at AS data_iscrizione,
    cl.created_at AS consenso_data,
    cl.origine AS consenso_origine,
    cl.informativa_versione, cl.informativa_hash,
    cl.ip_address, cl.user_agent, cl.secondi_permanenza
  FROM public.iscritti_whatsapp i
  LEFT JOIN public.consensi_log cl ON cl.id = i.consenso_log_id
  WHERE (_stato = 'tutti'
         OR (_stato = 'nuovo'    AND i.stato = 'nuovo')
         OR (_stato = 'ignorato' AND i.stato = 'ignorato')
         OR (_stato = 'collegato' AND i.stato LIKE 'collegato%'))
    AND (_origine = 'tutti' OR i.origine = _origine)
    AND (_q IS NULL OR _q = '' OR
         i.numero_raw ILIKE '%'||_q||'%' OR
         i.nome       ILIKE '%'||_q||'%' OR
         i.cognome    ILIKE '%'||_q||'%' OR
         i.azienda    ILIKE '%'||_q||'%')
  ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_iscritti_whatsapp(text, text, text) TO authenticated, service_role, supabase_read_only_user;