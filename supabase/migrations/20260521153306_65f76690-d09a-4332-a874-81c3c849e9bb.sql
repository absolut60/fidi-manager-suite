
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Rimuovi eventuale job esistente con stesso nome
DO $$
BEGIN
  PERFORM cron.unschedule('check-scadenze-fido-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'check-scadenze-fido-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c39b9f1b-be3e-4e5c-8b69-3cf1408dd985.lovable.app/api/public/hooks/check-scadenze',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
