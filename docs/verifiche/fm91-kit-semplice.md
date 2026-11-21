# FM91 — Kit semplice a righe

21/11/2026. Ripresa del lavoro salvato nel commit `74e1a319`. Nessuna nuova migrazione in questa ripresa, nessuna scrittura di dati reali.

## Schema e dati

- Migrazione già applicata e verificata: `drizzle/migrations/0253_fm91_kit_semplice.sql`, nove colonne nullable e CHECK richiesti. Nessuna FK per `riga_rif`, che è l'ordine nello stesso kit. RLS e secondo fattore invariati.
- Database reale: **1 kit, 10 componenti, 0 parametri, 0 varianti**, prima e dopo. Kit `SM-PAR-2L-75-50`, PARETE 75/50 LASTRE 1+1, letto senza modificarlo.
- Impronta completa componenti prima/dopo: `5940c6b0182de5ce3de2887c7fc6d9c6`. Impronta kit: `f27ce8be5f23aec421ed8119dfe31b4c`. Comprendono tutti i dati e le date, non soltanto i conteggi.
- Il kit reale produce **18,829447 kg/mq** (18,829446666666667 senza arrotondamento) e **3 righe senza peso**. Dieci incidenze visualizzate: 1; 0,716667; 3,383333; 1; 1; 0,05; 1,433333; 0,016917; 0,08; 0,032.

## Risultato

- Scheda collegata al motore già aggiunto: tabella da 1024px, schede Articolo/Calcolo/Risultato sotto 1024px; celle numeriche con virgola, salvataggio all'uscita, menu della riga collegata e totale peso. Incidenza e pesi soltanto da `calcolaKitRegole`/`totalePesoKit`.
- Aggiunta e modifica tramite `RigaKitDialog`: articolo Gamma oppure finestra manuale condivisa, campi di calcolo, peso/note, anteprima e valore fisso storico. Nuovo ordine massimo + 1. Corretta la chiusura JSX segnalata. Campi numerici non validi impediscono il salvataggio invece di ignorare il testo scritto.
- Parametri, prova parametri e sei operandi rimossi dalla vista; codice precedente e lettura parametri rimangono per retrocompatibilità. Ruoli di variante in sola lettura.
- Altre linee: solo Quantità per kit e peso, dalla configurazione, senza confronti di linea. Nessuna quantità/peso ricavata automaticamente dalle confezioni Gamma.
- Scritture e duplicazione passano da `normalizzaPatchSempliceKit` attraverso l'adattatore già presente `normalizzaPatchRegoleKit`. Copia verificata per tutti i nove campi. Errori di copia o validazione parziale espliciti; creazione/aggiornamento senza riga restituita non dichiarati riusciti.

## Test e fotografie

- Suite completa `bun test`: **1247 pass, 0 fail**, 153 file, 4083 asserzioni. Guardie AST di linee ed eliminazioni comprese, nessuna eccezione aggiunta.
- 36 test nuovi: dieci valori Excel, totale/pesi noti e mancanti, struttura doppia, tre divisori zero, riferimento inesistente/cicli/dipendenze, N=0 della collegata, precedenze, confezione non dedotta, precisione e retrocompatibilità, validazione e configurazione. Test API preesistenti estesi a salvataggi e duplicazione dei nove campi, con fallimenti parziali.
- Playwright a **375, 768, 1280 e 1920px**, altezza 1800: **overflow pagina 0**, **overflow dialog 0**, **errori runtime 0**. Fotografie esaminate di pagina, righe, dialog, input non valido, modifica inline e modalità solo quantità; conservate in `docs/verifiche/fm91-kit-semplice/`.
- Flusso verificato nella copia temporanea del kit reale: passo montanti 0,6 → 0,4 dà 5,05; modifica dialog riporta 0,6 e 3,383333; aggiunta manuale ordine 11, anteprima quantità/peso e blocco salvataggio con passo zero. La rilettura a schermo conferma i valori dopo la conferma. Tutte queste scritture sono **soltanto nello stato locale della pagina temporanea**, non nel database.
- Compilazione automatica `build OK`; nessun typecheck manuale. `git diff --check` pulito. Pagina temporanea rimossa.

## Limiti

- Sessione personale non disponibile: `lovable auth-session --json --self` non trova l'account del richiedente. Il kit reale è stato letto mediante gli strumenti dati e visualizzato sulla pagina temporanea; **apertura della route autenticata e salvataggi persistiti con RLS non verificati**. Nessun account altrui usato né permesso ampliato.
- Duplicazione non atomica, con errore esplicito se il kit è creato ma la copia non termina. Il divisore confezione rimane una scelta dell'operatore, non deducibile automaticamente da UM1.
- Preventivi, «Da kit», `kit-legacy.ts`, prezzi e dati reali non modificati. Pulizia del codice storico/import Excel esclusi.

## File della ripresa

- `src/routes/_app/kit.$id.tsx`
- `src/components/kit/ComponenteKit.tsx`
- `src/components/kit/CampiCalcoloKit.tsx`
- `src/components/kit/RigaKitDialog.tsx`
- `src/lib/kit-api.ts`
- `src/lib/AGENTS.md` (root saturo, regola d'area aggiornata senza aggiungere una seconda fonte)
- `tests/kit-semplice.test.ts`
- `tests/kit-regole-ui.test.ts`
- `docs/regole/kit.md`
- questo rapporto e fotografie
- `roadmap.md`

Motore, configurazione linee, normalizzatore e migrazione 0253 già presenti nella tappa precedente e conservati.