
-- Create cron secret in vault (single source of truth)
DO $$
DECLARE
  _exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') INTO _exists;
  IF NOT _exists THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cron_secret', 'Shared secret for /api/public/hooks/* cron endpoints');
  END IF;
END $$;

-- Reschedule cron jobs to send the secret via x-cron-secret header
SELECT cron.unschedule('check-scadenze-fido-daily');
SELECT cron.unschedule('check-reminder-ritardi-daily');

SELECT cron.schedule(
  'check-scadenze-fido-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c39b9f1b-be3e-4e5c-8b69-3cf1408dd985.lovable.app/api/public/hooks/check-scadenze',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'check-reminder-ritardi-daily',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c39b9f1b-be3e-4e5c-8b69-3cf1408dd985.lovable.app/api/public/hooks/check-reminder-ritardi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
