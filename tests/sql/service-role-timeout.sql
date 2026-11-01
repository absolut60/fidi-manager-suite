-- FM55 fetta 4c (01/11/2026): verifica i limiti di tempo dei ruoli database, senza cambiare nulla.
-- Regola documentata in docs/regole/fonti-uniche.md, «Limiti di tempo dei ruoli database».
BEGIN;
DO $test$
BEGIN
  ASSERT (SELECT rolconfig @> ARRAY['statement_timeout=60s'] FROM pg_roles WHERE rolname = 'service_role'),
    'service_role deve avere statement_timeout 60s (job server)';
  ASSERT (SELECT array_to_string(rolconfig, ',') LIKE '%statement_timeout=8s%' FROM pg_roles WHERE rolname = 'authenticated'),
    'authenticated deve restare a statement_timeout 8s';
  ASSERT NOT (SELECT rolconfig @> ARRAY['statement_timeout=60s'] FROM pg_roles WHERE rolname = 'authenticated'),
    'authenticated non deve avere il limite alzato a 60s';
  ASSERT (SELECT array_to_string(rolconfig, ',') LIKE '%statement_timeout=8s%' FROM pg_roles WHERE rolname = 'authenticator'),
    'authenticator deve restare a statement_timeout 8s';
END;
$test$;
ROLLBACK;
