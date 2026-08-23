CREATE OR REPLACE FUNCTION public.notifica_nuovo_messaggio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_canale text;
  v_nome_autore text;
  v_anteprima text;
BEGIN
  IF NEW.eliminato_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT COALESCE(NULLIF(trim(c.nome), ''), 'Chat') INTO v_nome_canale
    FROM public.canali c WHERE c.id = NEW.canale_id;
    v_nome_canale := COALESCE(v_nome_canale, 'Chat');

    SELECT NULLIF(trim(COALESCE(p.nome,'') || ' ' || COALESCE(p.cognome,'')), '') INTO v_nome_autore
    FROM public.profili p WHERE p.id = NEW.autore_id;
    v_nome_autore := COALESCE(v_nome_autore, 'Qualcuno');

    v_anteprima := left(NEW.testo, 120);

    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT cm.user_id,
           'chat_messaggio',
           v_nome_autore || ' in ' || v_nome_canale,
           v_anteprima,
           '/chat',
           jsonb_build_object('canale_id', NEW.canale_id, 'messaggio_id', NEW.id)
    FROM public.canale_membri cm
    WHERE cm.canale_id = NEW.canale_id
      AND cm.user_id <> NEW.autore_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_nuovo_messaggio fallita per messaggio %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifica_nuovo_messaggio ON public.messaggi;
CREATE TRIGGER trg_notifica_nuovo_messaggio
AFTER INSERT ON public.messaggi
FOR EACH ROW EXECUTE FUNCTION public.notifica_nuovo_messaggio();

GRANT EXECUTE ON FUNCTION public.notifica_nuovo_messaggio() TO authenticated, service_role;