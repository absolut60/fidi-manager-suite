CREATE OR REPLACE FUNCTION public.notifica_assegnazione_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deve_notificare boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_deve_notificare := NEW.esecutore_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_deve_notificare := NEW.esecutore_id IS NOT NULL
                         AND NEW.esecutore_id IS DISTINCT FROM OLD.esecutore_id;
  END IF;

  IF NOT v_deve_notificare THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.canale_id IS NOT NULL THEN
      INSERT INTO public.canale_membri (canale_id, user_id)
      VALUES (NEW.canale_id, NEW.esecutore_id)
      ON CONFLICT DO NOTHING;
    END IF;

    IF NEW.esecutore_id IS DISTINCT FROM COALESCE(NEW.titolare_id, auth.uid()) THEN
      INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        NEW.esecutore_id,
        'task_assegnato',
        'Ti è stato assegnato un task',
        left(NEW.titolo, 120),
        '/task/' || NEW.id::text,
        jsonb_build_object('task_id', NEW.id, 'canale_id', NEW.canale_id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_assegnazione_task fallita per task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notifica_assegnazione_task() TO authenticated, service_role, supabase_read_only_user;

DROP TRIGGER IF EXISTS trg_notifica_assegnazione_task ON public.task;
CREATE TRIGGER trg_notifica_assegnazione_task
  AFTER INSERT OR UPDATE OF esecutore_id ON public.task
  FOR EACH ROW
  EXECUTE FUNCTION public.notifica_assegnazione_task();