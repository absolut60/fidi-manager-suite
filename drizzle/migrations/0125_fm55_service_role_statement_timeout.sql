-- FM55 fetta 4c (decisione di Andrea, 01/11/2026): limite di tempo per i job server.
-- Motivo: il ricalcolo del fido teorico (pulsante "Ricalcola fido teorico ora" e job Inngest,
-- entrambi con supabaseAdmin = ruolo service_role) si e fermato due volte a meta (blocco 14
-- da 500 clienti, poi blocco 39 da 200) perche il tempo di un blocco varia molto con il carico
-- del database: misurati da 0,5 s a 24 s sullo stesso blocco. Con il limite di 8 s ereditato
-- dalla chiamata dati anche tre tentativi non bastavano.
-- service_role passa a statement_timeout 60s per i job server; gli utenti (authenticated)
-- restano a 8s, authenticator resta a 8s (lock_timeout 8s invariato).
-- Idempotente: rieseguirla non cambia nulla.
ALTER ROLE service_role SET statement_timeout = '60s';
NOTIFY pgrst, 'reload config';