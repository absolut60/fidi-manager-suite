ALTER TABLE public.promemoria_scadenza_log
  ADD COLUMN IF NOT EXISTS email_html text NULL;

COMMENT ON COLUMN public.promemoria_scadenza_log.email_html IS
  'HTML dell''email generata con useCid=false (ri-renderizzabile in iframe). Popolato per tutti gli esiti: inviato, fallito, saltato_no_email. Ripulito dal job di retention oltre 90 giorni (metadati e bridge conservati).';