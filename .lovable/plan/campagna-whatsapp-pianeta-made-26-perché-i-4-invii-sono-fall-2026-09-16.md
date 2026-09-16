# Campagna WhatsApp "PIANETA MADE 26": perché i 4 invii sono falliti

## Diagnosi (verificata sul database)

**Tabelle**
- Campagne: `campagne_whatsapp`
- Destinatari/invii: `messaggi_whatsapp`
- Template: `whatsapp_template`

**1. Campagna**
- id `3177b7a3-0392-4eb0-bfb2-928627b81982`, nome "Campagna PIANETA MADE 26"
- stato `completata`, totale 4, inviati 0, falliti 4
- creata 16/09/2026 11:28, chiusa 11:35
- `parametri` = `{ "vars": {} }`

**2. I 4 destinatari (tutti `fallito`, nessun id messaggio Meta)**

| nome | numero | errore |
|---|---|---|
| Enrico Mongiusti | 3484458626 | (#132012) Parameter format does not match format in the created template |
| Andrea Giani | 3384863801 | stesso errore |
| Emanuele Rio | 3493313695 | stesso errore |
| Omar Sfratta | 3783032220 | stesso errore |

**3. Template**
- "PIANETA MADE - 18.09.2026", stato `approvato` (quindi NON è un problema di approvazione Meta)
- `meta_template_name` `pianeta_made_18_09_2026`, lingua `it`
- `header_tipo` = `immagine`, `header_media_url` = `/api/public/email-img/campagne/whatsapp-template/.../bd47d879-....jpg`
- Il corpo del testo non contiene variabili `{{1}}`, `{{2}}`, ecc.

**4. Errore verbatim Meta**: `(#132012) Parameter format does not match format in the created template`

**Causa**: il template approvato ha un'intestazione con immagine, ma il codice di invio costruisce il messaggio con i soli parametri del corpo. Poiché il corpo non ha variabili, viene inviato un messaggio senza alcun componente: manca il componente "header" con il link dell'immagine, che Meta considera obbligatorio. Da qui il rifiuto per formato non corrispondente, uguale per tutti e quattro.

Nota collegata: l'indirizzo dell'immagine salvato è relativo; per essere scaricabile da Meta va inviato come indirizzo assoluto sul dominio pubblico di produzione.

## Correzione proposta (da approvare prima di toccare il codice)

1. In `src/lib/inngest/campagna-whatsapp.server.ts`, leggere anche `header_tipo` e `header_media_url` del template nello step `prepara` e passarli all'invio.
2. In `src/lib/inngest/whatsapp-invio.server.ts`, aggiungere il componente header quando il template ha un'immagine:
   - `{ type: "header", parameters: [{ type: "image", image: { link: <url assoluto> } }] }`
   - includere il componente body solo quando ci sono parametri (comportamento attuale).
3. Rendere assoluto l'indirizzo dell'immagine usando lo stesso criterio già adottato in `src/lib/whatsapp-template.functions.ts` (`originPubblico()`), così Meta scarica il file dal dominio pubblico.
4. Riprovare l'invio: i destinatari falliti vanno rimessi in coda (o creata una nuova campagna) — da decidere insieme, non incluso in questa correzione.

Nessuna modifica al database e nessuna modifica alla logica dei template o delle campagne oltre a quanto sopra.
