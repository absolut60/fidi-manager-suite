# Roadmap

- [x] Strato 2b WhatsApp: server function `sincronizzaStatiTemplate` + bottone "Sincronizza stati" nel tab template
- [x] Messaggio chiaro su errori temporanei 5xx (502/503/504/522) — incluso nella nuova funzione di sync

- [x] WhatsApp: originPubblico() sceglie un solo dominio pubblico da APP_URL multi-valore

## Alert variazioni blocco clienti (fette)
- [x] Fetta 1 — scheletro DB (clienti_blocco_stato, clienti_blocco_variazioni, RPC rileva_variazioni_blocco non invocata)
- [x] Fetta 2 — pagina "Variazioni blocco clienti" + voce menu (clienti-variazioni-blocco.tsx, app-shell.tsx)
- [ ] Fetta 3 — notifiche al completamento dell'import (aggancio da definire con l'utente)
