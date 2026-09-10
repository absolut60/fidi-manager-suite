ALTER TABLE public.iscritti_whatsapp ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.registra_stop_whatsapp(_numero_raw text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num text;
  v_isc record;
  v_tipo text := null;
  v_sogg uuid := null;
  v_scritto boolean := false;
  v_stato boolean;
BEGIN
  v_num := public.normalizza_numero_it(_numero_raw);
  IF v_num IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'numero_non_valido');
  END IF;

  SELECT * INTO v_isc
  FROM public.iscritti_whatsapp
  WHERE numero_norm = v_num
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_isc.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'trovato', false, 'azione', 'nessun_iscritto',
      'iscritto_id', null, 'soggetto_tipo', null, 'consenso_scritto', false);
  END IF;

  UPDATE public.iscritti_whatsapp SET whatsapp_opt_out = true WHERE id = v_isc.id;

  IF v_isc.cliente_id IS NOT NULL THEN
    v_tipo := 'cliente'; v_sogg := v_isc.cliente_id;
  ELSIF v_isc.lead_id IS NOT NULL THEN
    v_tipo := 'lead'; v_sogg := v_isc.lead_id;
  ELSIF v_isc.contatto_id IS NOT NULL THEN
    v_tipo := 'contatto'; v_sogg := v_isc.contatto_id;
  END IF;

  IF v_sogg IS NOT NULL THEN
    SELECT opt_in INTO v_stato
    FROM public.v_whatsapp_opt_in_attuale
    WHERE (v_tipo = 'cliente'  AND cliente_id  = v_sogg)
       OR (v_tipo = 'lead'     AND lead_id     = v_sogg)
       OR (v_tipo = 'contatto' AND contatto_id = v_sogg)
    LIMIT 1;

    IF v_stato IS DISTINCT FROM false THEN
      IF v_tipo = 'cliente' THEN
        INSERT INTO public.consensi_log (tipo_consenso, valore, origine, note, cliente_id)
        VALUES ('whatsapp', false, 'recesso_link', 'STOP via WhatsApp', v_sogg);
      ELSIF v_tipo = 'lead' THEN
        INSERT INTO public.consensi_log (tipo_consenso, valore, origine, note, lead_id)
        VALUES ('whatsapp', false, 'recesso_link', 'STOP via WhatsApp', v_sogg);
      ELSE
        INSERT INTO public.consensi_log (tipo_consenso, valore, origine, note, contatto_id)
        VALUES ('whatsapp', false, 'recesso_link', 'STOP via WhatsApp', v_sogg);
      END IF;
      v_scritto := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'trovato', true,
    'iscritto_id', v_isc.id,
    'soggetto_tipo', v_tipo,
    'consenso_scritto', v_scritto
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registra_stop_whatsapp(text) TO service_role, anon, authenticated;