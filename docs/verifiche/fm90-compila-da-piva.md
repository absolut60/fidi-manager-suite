# FM90 — Compila da P.IVA

## Comportamento
- Pulsante solo nei form Nuovo lead e modifica lead; attivo con 11 cifre, accetta prefisso IT/spazi, caricamento e controllo di P.IVA cambiata durante la ricerca.
- Ricerca autenticata esclusivamente `cercaSoggettoPerPiva` → `scegliAziendaPerPiva` → `normalizzaAziendaCerved`. Nessun acquisto, recupero, fotografia, collegamento o monitoraggio; resta la registrazione `entity_search` esistente.
- Il form nuovo riceve subito solo i campi vuoti; tutti i valori diversi già compilati restano invariati finché selezionati e applicati nella finestra. In modifica tutte le differenze disponibili sono selezionate inizialmente; i dati assenti nella risposta non cancellano il form.
- Mappatura unica degli otto campi richiesti, tipo soggetto azienda incluso. Forma giuridica e ATECO solo informativi. Stato non attivo segnalato in rosso, duplicati visibili linkati in nuova scheda. Nessun salvataggio diretto del lead.
- Duplicati cercati con client dell'utente e RLS, candidati paginati e confronto finale sulle sole cifre, esclusione del lead corrente.

## Permessi e database verificati
- Nuovo lead è offerto all'interno della pagina gated da `puoAccedereLead`, non da `puoGestireLead`. Server riusa lo stesso helper su ruoli letti da `user_roles` con client autenticato, più `auth_mfa_ok`.
- Verificate le policy reali `lead_insert`, `Preventivisti: lead INSERT propri`, `Showroom: lead della sede (inserimento)` e le rispettive funzioni `has_lead_module_access`, `auth_preventivista`, `auth_e_showroom`: restano invariate. Nessun nuovo elenco ruoli.
- `cerved_chiamate` SELECT è amministratore soltanto. Il contatore usa una server function protetta da `auth_puo_aggiornare_cerved` e MFA, poi una query privilegiata `head:true/count:exact` che restituisce esclusivamente il numero; nessun accesso alle risposte Cerved viene esposto. Questo evita la migrazione per una nuova RPC.
- Contatore per anno civile Europe/Rome, tutte le `entity_search` incluse, anche dal collegamento; quota indicativa unica in `cerved-entita.ts`. Conteggio reale iniziale verificato: 80 nel 2026.
- Nessuna migrazione né modifica a policy, tabelle o dati anagrafici esistenti.

## Verifiche
- `bun test`: **1139 pass, 0 fail**, 148 file; 11 nuovi test di mapping, campi vuoti, differenze, dati mancanti, P.IVA, permesso, chiamate/scritture vietate, duplicati RLS, stato, quota e cambio anno.
- `bunx tsgo --noEmit`: pulito. Segnale preview: build OK.
- Playwright sul componente di confronto reale con fixture sintetica: 320, 375, 390, 768 touch, 1280 e 1920. Nessun overflow né errore runtime. Verificate spunte iniziali, esclusione del nome dalla sovrascrittura, applicazione degli altri campi, riempimento solo dei vuoti in creazione, conservazione dei valori manuali e link duplicati `_blank`.
- Foto stabili dopo apertura: creazione/modifica e valori applicati; foto 375/1280 ispezionate. Scroll interno della finestra e footer sempre raggiungibile. Fixture temporanea rimossa.
- **Limite:** sessione personale non disponibile (`auth-session --self` non trova un account corrispondente). Non verificati ricerca Cerved reale e percorso autenticato completo nei due form o lettura del contatore attraverso Impostazioni. Nessuna chiamata reale Cerved effettuata durante le prove; nessun acquisto.

## File modificati
- `src/lib/cerved/cerved-entita.ts`
- `src/lib/cerved/cerved-anagrafica.ts` (nuovo)
- `src/lib/cerved/cerved-anagrafica.functions.ts` (nuovo)
- `src/components/lead/compila-da-piva.tsx` (nuovo)
- `src/components/lead/nuovo-lead-dialog.tsx`
- `src/routes/_app/lead.$leadId.tsx`
- `src/components/impostazioni/report-cerved-attesa-card.tsx`
- `tests/cerved-anagrafica.test.ts` (nuovo)
- `src/lib/cerved/AGENTS.md`
- `docs/verifiche/fm90-compila-da-piva.md` (questo rapporto)
- `roadmap.md`

Nuova fonte unica: mapping/confronto in `cerved-anagrafica`, ricerca/contatore in `cerved-anagrafica.functions`, finestra condivisa in `CompilaDaPiva`. Regola Cerved aggiunta nell'AGENTS dell'area; AGENTS radice non modificato perché già al limite di dimensione e contiene regole del proprietario non comprimibili. Nessuna modifica autonoma ai documenti di regole dell'area.