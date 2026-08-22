CREATE OR REPLACE FUNCTION public.invia_push_da_notifica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app_url text;
  v_secret text;
BEGIN
  -- Guardie di sicurezza: non inviare senza destinatario o titolo valido
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.titolo IS NULL OR trim(NEW.titolo) = '' THEN
    RETURN NEW;
  END IF;

  -- Legge la configurazione dal Vault
  SELECT decrypted_secret INTO v_app_url FROM vault.decrypted_secrets WHERE name = 'app_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_push_secret';

  IF v_app_url IS NULL OR v_secret IS NULL OR v_secret = 'DA_POPOLARE' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_app_url || '/api/public/invia-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object(
        'userId', NEW.user_id,
        'title', NEW.titolo,
        'body', COALESCE(NEW.messaggio, ''),
        'url', COALESCE(NEW.link, '/'),
        'tag', 'notifica-' || NEW.id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[invia_push_da_notifica] invio fallito per notifica %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;