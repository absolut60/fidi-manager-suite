ALTER TABLE public.preventivi
  ADD COLUMN assegnato_a uuid NULL,
  ADD COLUMN assegnati_copia uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX idx_preventivi_assegnato_a ON public.preventivi (assegnato_a);
CREATE INDEX idx_preventivi_assegnati_copia ON public.preventivi USING gin (assegnati_copia);

CREATE FUNCTION public.notifica_assegnazione_preventivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_autore uuid := auth.uid();
  v_copia_precedente uuid[] := '{}'::uuid[];
  v_responsabile_nuovo boolean := false;
  v_destinatario uuid;
  v_messaggio text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_responsabile_nuovo := NEW.assegnato_a IS NOT NULL;
  ELSE
    v_responsabile_nuovo := NEW.assegnato_a IS NOT NULL
      AND NEW.assegnato_a IS DISTINCT FROM OLD.assegnato_a;
    v_copia_precedente := OLD.assegnati_copia;
  END IF;

  BEGIN
    v_messaggio := left(concat_ws(' — ', NEW.numero, NULLIF(NEW.titolo, '')), 120);

    IF v_responsabile_nuovo AND NEW.assegnato_a IS DISTINCT FROM v_autore THEN
      INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (NEW.assegnato_a, 'preventivo_assegnato',
        'Ti è stato assegnato un preventivo', v_messaggio,
        '/preventivatore/' || NEW.id::text,
        jsonb_build_object('preventivo_id', NEW.id));
    END IF;

    FOR v_destinatario IN
      SELECT DISTINCT nuova.persona
      FROM unnest(NEW.assegnati_copia) AS nuova(persona)
      WHERE nuova.persona IS NOT NULL
        AND nuova.persona IS DISTINCT FROM v_autore
        AND NOT EXISTS (
          SELECT 1 FROM unnest(v_copia_precedente) AS vecchia(persona)
          WHERE vecchia.persona = nuova.persona
        )
    LOOP
      INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (v_destinatario, 'preventivo_assegnato',
        'Sei in copia su un preventivo', v_messaggio,
        '/preventivatore/' || NEW.id::text,
        jsonb_build_object('preventivo_id', NEW.id));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_assegnazione_preventivo fallita per preventivo %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notifica_assegnazione_preventivo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notifica_assegnazione_preventivo() TO service_role;

CREATE TRIGGER trg_notifica_assegnazione_preventivo
AFTER INSERT OR UPDATE OF assegnato_a, assegnati_copia ON public.preventivi
FOR EACH ROW EXECUTE FUNCTION public.notifica_assegnazione_preventivo();