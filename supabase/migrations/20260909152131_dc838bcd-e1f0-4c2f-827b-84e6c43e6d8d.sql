CREATE OR REPLACE FUNCTION public.backfill_contatti_iscritti_whatsapp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_cont uuid;
  v_creati int := 0;
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  FOR r IN
    SELECT id, cliente_id, consenso_log_id
    FROM public.iscritti_whatsapp
    WHERE stato = 'collegato_cliente'
      AND cliente_id IS NOT NULL
      AND contatto_id IS NULL
  LOOP
    v_cont := public._crea_contatto_da_iscritto(r.id, r.cliente_id);
    IF v_cont IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_cont WHERE id = r.id;
      IF r.consenso_log_id IS NOT NULL THEN
        UPDATE public.consensi_log
        SET contatto_id = v_cont
        WHERE id = r.consenso_log_id AND contatto_id IS NULL;
      END IF;
      v_creati := v_creati + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contatti_creati', v_creati);
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_contatti_iscritti_whatsapp() TO authenticated, service_role;