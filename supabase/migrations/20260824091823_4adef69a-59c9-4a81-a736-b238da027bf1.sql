CREATE OR REPLACE FUNCTION public.elimina_task(_task_id uuid)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_titolare uuid;
  v_canale uuid;
BEGIN
  SELECT t.titolare_id, t.canale_id INTO v_titolare, v_canale
  FROM public.task t WHERE t.id = _task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task inesistente';
  END IF;

  IF NOT (v_titolare = auth.uid() OR public.has_role(auth.uid(), 'amministratore'::app_role)) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  RETURN QUERY
    SELECT a.storage_path FROM public.allegati a
    WHERE a.entita_tipo = 'messaggio'
      AND v_canale IS NOT NULL
      AND a.entita_id IN (SELECT m.id FROM public.messaggi m WHERE m.canale_id = v_canale)
    UNION ALL
    SELECT a.storage_path FROM public.allegati a
    WHERE a.entita_tipo = 'task' AND a.entita_id = _task_id;

  IF v_canale IS NOT NULL THEN
    DELETE FROM public.allegati a
    WHERE a.entita_tipo = 'messaggio'
      AND a.entita_id IN (SELECT m.id FROM public.messaggi m WHERE m.canale_id = v_canale);
  END IF;

  DELETE FROM public.allegati a WHERE a.entita_tipo = 'task' AND a.entita_id = _task_id;

  IF v_canale IS NOT NULL THEN
    DELETE FROM public.messaggi m WHERE m.canale_id = v_canale;
    DELETE FROM public.canale_membri cm WHERE cm.canale_id = v_canale;
  END IF;

  DELETE FROM public.task t WHERE t.id = _task_id;

  IF v_canale IS NOT NULL THEN
    DELETE FROM public.canali c WHERE c.id = v_canale;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.elimina_task(uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_canali_non_letti()
RETURNS TABLE(canale_id uuid, tipo public.tipo_canale, task_id uuid, non_letti bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         c.tipo,
         CASE WHEN c.tipo = 'task'::public.tipo_canale
              THEN (SELECT t.id FROM public.task t WHERE t.canale_id = c.id LIMIT 1)
              ELSE NULL::uuid END,
         cnt.n
  FROM public.canale_membri cm
  JOIN public.canali c ON c.id = cm.canale_id
  CROSS JOIN LATERAL (
    SELECT count(*)::bigint AS n
    FROM public.messaggi m
    WHERE m.canale_id = cm.canale_id
      AND m.created_at > COALESCE(cm.ultimo_letto_at, 'epoch'::timestamptz)
      AND m.autore_id <> auth.uid()
      AND m.eliminato_at IS NULL
  ) cnt
  WHERE cm.user_id = auth.uid()
    AND cnt.n > 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_canali_non_letti() TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.segna_canale_letto(_canale_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.canale_membri SET ultimo_letto_at = now()
  WHERE canale_id = _canale_id AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.segna_canale_letto(uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.notifica_nuovo_messaggio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome_canale text;
  v_nome_autore text;
  v_anteprima text;
  v_tipo public.tipo_canale;
  v_task_id uuid;
  v_link text;
BEGIN
  IF NEW.eliminato_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT COALESCE(NULLIF(trim(c.nome), ''), 'Chat'), c.tipo INTO v_nome_canale, v_tipo
    FROM public.canali c WHERE c.id = NEW.canale_id;
    v_nome_canale := COALESCE(v_nome_canale, 'Chat');

    IF v_tipo = 'task'::public.tipo_canale THEN
      SELECT t.id INTO v_task_id FROM public.task t WHERE t.canale_id = NEW.canale_id LIMIT 1;
      v_link := COALESCE('/task/' || v_task_id::text, '/chat');
    ELSE
      v_link := '/chat?canale=' || NEW.canale_id::text;
    END IF;

    SELECT NULLIF(trim(COALESCE(p.nome,'') || ' ' || COALESCE(p.cognome,'')), '') INTO v_nome_autore
    FROM public.profili p WHERE p.id = NEW.autore_id;
    v_nome_autore := COALESCE(v_nome_autore, 'Qualcuno');

    v_anteprima := left(NEW.testo, 120);

    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT cm.user_id,
           'chat_messaggio',
           v_nome_autore || ' in ' || v_nome_canale,
           v_anteprima,
           v_link,
           jsonb_build_object('canale_id', NEW.canale_id, 'messaggio_id', NEW.id)
    FROM public.canale_membri cm
    WHERE cm.canale_id = NEW.canale_id
      AND cm.user_id <> NEW.autore_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_nuovo_messaggio fallita per messaggio %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;