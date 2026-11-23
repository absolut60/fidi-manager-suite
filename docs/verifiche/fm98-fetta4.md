# FM98 — Fetta 4: creazione lead completa dal preventivo

## Perimetro

Nessuna migrazione, modifica di schema, RLS, gate SQL, motore prezzi o esportazione Gamma. Nessuna pubblicazione e nessuna scrittura di prova sul database ospitato.

Verifica `information_schema.columns` sul database reale: `lead.listino_rif` smallint, `macrocategoria_rif`, `categoria_rif`, `condizione_pagamento_cod`, `codice_sdi`, `tipo_soggetto` text e `store_id` uuid esistono e sono nullable. Non serve alcuna aggiunta.

## Implementazione

- Ogni `SoggettoPreventivoPicker` apre `NuovoLeadDialog` in sovrapposizione con `origine="preventivo"`, sede proposta e callback `onCreato`. Vale per nuovi preventivi/ordini e per il picker del cambio soggetto. Rimossa la sottomaschera ridotta insieme a `creaLeadPreventivo`, `inputLeadRapido`, `campiLeadRapido` e ai test diventati inutili.
- La creazione usa soltanto `creaLead`, mantenendo normalizzazioni, stato e storico esistenti. Salva anche le quattro colonne commerciali e restituisce il DTO lead letto nella risposta dell'INSERT: nessuna seconda creazione o rilettura post-salvataggio.
- `LeadCondizioniCommerciali` è riusato per il nuovo riquadro: `CondizioniRiferimento`, `opzioniCataloghiRiferimento` e `CondizionePagamentoRichiestaSelect` sono le fonti già usate dal preventivo. Nessun catalogo duplicato. Il riquadro usa `RiquadroAnagrafica`, fondo card e sola barra colorata a sinistra.
- `condizioniLeadMancanti` impone le quattro condizioni soltanto con origine preventivo; messaggio esplicito e Crea disabilitato finché incomplete. Fuori dal documento restano facoltative e la sezione conserva il perimetro `puoConsultarePreventivi`. Il comportamento già esistente del riferimento facoltativo è conservato: spento azzera i tre riferimenti; acceso richiede il gruppo completo.
- La sede dal documento è precompilata e modificabile; fuori da questo percorso resta il vincolo storico showroom. Le policy continuano a decidere quali sedi possono essere salvate. Agente, indirizzo, P.IVA/Cerved, SDI, fonte, tipo, priorità e note conservano i controlli esistenti.
- Nel nuovo documento `scegliSoggetto` è il solo handler per `soggettoIniziale`, scelta e creazione dal picker. Usa `condizioniDaLeadPreventivo` per riferimento/pagamento/agente e il risolutore di sede esistente. Il vincolo agente delega a `scritturaPreventiviVincolataAgente`: write-only conserva il codice del profilo; i ruoli esenti conservano l'agente del lead.
- Salvataggio dal documento: selezione del lead, chiusura della sola maschera lead, nessuna navigazione e nessuna azione toast «Vai al lead». Condizioni e pagamento del documento restano modificabili. Il percorso dalla lista conserva il toast e l'azione facoltativa già esistenti.
- Il selettore dei riferimenti riceve soltanto i tre campi commerciali: durante il primo collaudo è emerso che passare l'intero form avrebbe ripristinato nome/sede/agente iniziali. Il passaggio è stato isolato e il flusso rieseguito, verificando che tutti i dati inseriti restino presenti.

## Scheda lead: cosa c'era già

In `src/routes/_app/lead.$leadId.tsx` le quattro condizioni erano **già visibili e modificabili**, con `LeadCondizioniCommerciali`, riquadro `LeadSection` e gate `puoConsultarePreventivi`. Il salvataggio usa già `campiCondizioniCommercialiLead`; gli utenti esclusi non scrivono i quattro campi. Non è stato modificato questo file né duplicata la sezione. Il componente condiviso mantiene il riferimento facoltativo nella scheda esistente.

## Test

- Suite completa: **1438 pass, 0 fail**, 173 file; 4707 asserzioni.
- Nuovi test `fm98-lead-completo.test.ts`: un test per ciascuna condizione obbligatoria solo dal preventivo; lista senza condizioni; salvataggio delle quattro colonne, SDI normalizzato, sede/agente/autore e storico; restituzione del lead; creazione ordinaria senza forzare i campi; copia e regole write-only, codice mancante ed esenzioni miste.
- Test preesistenti di soggetto, SDI e condizioni commerciali mantenuti; rimossi soltanto i casi del percorso rapido eliminato.
- Playwright, componenti reali e risposte di rete locali: 320×812, 375×812, 390×844, 768×1024 touch, 1280×1800, 1920×1080. Per ogni larghezza: nuovo preventivo, nuovo ordine e creazione dalla lista. Ulteriori prove a 375/1280 per `preventivi_write` e `responsabile_showroom`.
- Verificati apertura della maschera completa, assenza della sottomaschera, Crea disabilitato con pagamento mancante anche dopo gli altri tre valori, sede proposta e modificata, agente del lead, quattro colonne nel payload, lead selezionato, valori copiati e nessuna navigazione dopo creazione. Nel write-only l'agente del documento resta quello del profilo e il selettore è disabilitato. Lista con valori assenti: Crea abilitato e colonne nullable.
- Nessun errore runtime o overflow orizzontale nelle dieci combinazioni dispositivo/ruolo. Fotografie della maschera, del riquadro compilato e del documento selezionato in `/tmp/browser/fm98-f4/`; viste direttamente le fotografie a 375 e 1280. Caselle e pulsanti della maschera hanno target di almeno 40 px; i selettori possono andare a capo.
- La ricerca P.IVA conserva il gate preesistente `puoAccedereLead`: per il solo responsabile showroom il pulsante era già assente e non è stato aperto un permesso ulteriore.
- Controllo automatico della compilazione: ultime verifiche disponibili `build OK`; `git diff --check` senza errori.

## Limite del collaudo reale

`lovable auth-session --json --self` ha restituito «no auth user matches the requesting user's email». Il flusso autenticato con persistenza/rilettura sul database ospitato resta **non verificato**; non sono stati usati account altrui, cambiati ruoli o creati lead reali. Playwright verifica il flusso UI con dati sintetici intercettati, mentre i test API verificano i payload con client isolato: non sono prove delle policy ospitate. La verifica dello schema è stata invece effettuata sul database reale in sola lettura.

La route temporanea `verifica-fm98-lead` è stata rimossa; restano soltanto fixture e script di test ripetibili.

## File toccati

- `src/components/lead/nuovo-lead-dialog.tsx`
- `src/components/lead/lead-condizioni-commerciali.tsx`
- `src/components/preventivatore/SoggettoPreventivoPicker.tsx`
- `src/components/preventivatore/NuovoPreventivoDialog.tsx`
- `src/lib/lead-crea.ts`
- `src/lib/lead-preventivo-api.ts`
- `src/lib/lead-condizioni-commerciali.ts`
- `src/lib/soggetto-preventivo.ts`
- `tests/fm98-lead-completo.test.ts`
- `tests/fm98-lead-completo.browser.py`
- `tests/fixtures/fm98-lead-completo.tsx`
- `tests/soggetto-preventivo.test.ts`
- `tests/codice-sdi.test.ts`
- `AGENTS.md`, `roadmap.md`, questo rapporto.

Nuova regola tecnica registrata in `AGENTS.md`: maschera/creazione lead unica e inizializzazione condivisa del destinatario; nessun aggiornamento autonomo dei file `docs/regole/`.