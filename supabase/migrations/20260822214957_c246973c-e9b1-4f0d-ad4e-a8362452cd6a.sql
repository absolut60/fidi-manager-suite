-- 1. Vault secrets (idempotenti)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'app_url') THEN
    PERFORM vault.create_secret('https://fidi-manager-suite.lovable.app', 'app_url');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_push_secret') THEN
    PERFORM vault.create_secret('DA_POPOLARE', 'internal_push_secret');
  END IF;
END
$$;

-- 2. Funzione trigger
CREATE OR REPLACE FUNCTION public.invia_push_da_notifica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_url text;
  v_secret text;
BEGIN
  -- FASE DI TEST: solo tipo 'test_push'
  IF NEW.tipo IS DISTINCT FROM 'test_push' THEN
    RETURN NEW;
  END IF;

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
$$;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_invia_push_da_notifica ON public.notifiche;
CREATE TRIGGER trg_invia_push_da_notifica
AFTER INSERT ON public.notifiche
FOR EACH ROW EXECUTE FUNCTION public.invia_push_da_notifica();