# Gestione errore 522 su invio template WhatsApp a Meta (360dialog)

## Diagnosi (già confermata dai log)

- Il 522 proviene dalla risposta di 360dialog (Cloudflare: origine non raggiungibile), non da un malfunzionamento della nostra server function.
- Log esatto: `[whatsapp-template] errore Meta 522 error code: 522` alle 10:51:41 UTC.
- `D360_API_KEY` presente; nessun log "rete 360dialog"; la server function è raggiungibile nell'ambiente pubblicato.

## Intervento proposto (opzionale, solo se si vuole rendere l'errore più gestibile)

1. In `src/lib/whatsapp-template.functions.ts`, intercettare specificamente lo status 522/502/503/504 nella risposta di 360dialog e restituire un messaggio utente più chiaro, es. "Il servizio WhatsApp (360dialog) non risponde al momento: riprova tra qualche minuto." mantenendo il salvataggio in `nota_rifiuto` solo per errori di validazione Meta (4xx), non per errori temporanei 5xx.
2. Nessuna modifica a webhook, payload template, o altre logiche.

## Note tecniche

- File toccato: solo `src/lib/whatsapp-template.functions.ts`.
- Nessuna migration, nessun secret nuovo, nessuna modifica UI.
- Verifica: typecheck `bunx tsgo --noEmit` e rilettura del ramo di gestione errori.
