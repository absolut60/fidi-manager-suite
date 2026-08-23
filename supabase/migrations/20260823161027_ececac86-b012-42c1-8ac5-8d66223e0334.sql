CREATE OR REPLACE FUNCTION public.notifica_task_assegnato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuovo_esecutore uuid;
  v_nome_titolare text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.esecutore_id IS NULL THEN RETURN NEW; END IF;
    v_nuovo_esecutore := NEW.esecutore_id;
  ELSE
    IF NEW.esecutore_id IS NULL OR NEW.esecutore_id IS NOT DISTINCT FROM OLD.esecutore_id THEN
      RETURN NEW;
    END IF;
    v_nuovo_esecutore := NEW.esecutore_id;
  END IF;

  IF v_nuovo_esecutore IS DISTINCT FROM auth.uid() THEN
    BEGIN
      SELECT COALESCE(NULLIF(TRIM(COALESCE(p.nome,'') || ' ' || COALESCE(p.cognome,'')), ''), 'Qualcuno')
        INTO v_nome_titolare
      FROM public.profili p WHERE p.id = NEW.titolare_id;
      v_nome_titolare := COALESCE(v_nome_titolare, 'Qualcuno');

      INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        v_nuovo_esecutore,
        'task_assegnato',
        'Ti è stato assegnato un task',
        left(NEW.titolo, 120),
        '/task',
        jsonb_build_object('task_id', NEW.id, 'canale_id', NEW.canale_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notifica_task_assegnato: notifica fallita: %', SQLERRM;
    END;
  END IF;

  BEGIN
    IF NEW.canale_id IS NOT NULL THEN
      INSERT INTO public.canale_membri (canale_id, user_id)
      VALUES (NEW.canale_id, v_nuovo_esecutore)
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_task_assegnato: iscrizione canale fallita: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifica_task_assegnato ON public.task;
CREATE TRIGGER trg_notifica_task_assegnato
AFTER INSERT OR UPDATE OF esecutore_id ON public.task
FOR EACH ROW EXECUTE FUNCTION public.notifica_task_assegnato();

GRANT EXECUTE ON FUNCTION public.notifica_task_assegnato() TO authenticated, service_role;