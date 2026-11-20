# FM90 — Kit motore unico, fetta 1b

20/11/2026. Nessuna migrazione, nessuna modifica a schema/RLS o dati esistenti.

## Risultato

- Lista su LINEA → FAMIGLIA, famiglie e ordine da `kit_famiglie`; colori/badge dal catalogo linee. Card: codice, nome, unità base e numero componenti; rimosse fasce A/B/C/SOCI, prezzi, costi e margine.
- Filtro Linea multiplo persistente tramite `useFiltriPagina`, array validato; opzioni da `useLineeUtente`, nell'ordine del catalogo. Una sola abilitata: nessun filtro; nessuna abilitata: nessuna creazione. Un filtro salvato con sole linee oggi non abilitate non nasconde i kit delle linee correnti.
- Nuovo kit: linea predefinita del profilo se abilitata (altrimenti prima abilitata), famiglie attive, codice prefisso/progressivo modificabile, nome, unità base, descrizione e specifiche da configurazione. Nessun codice `LEGACY` inviato dalle schermate nuove. Concorrenza sui codici: vincolo DB e messaggio chiaro; duplicazione riprova fino a tre volte.
- Editor: linea in sola lettura, famiglia della linea, specifiche in JSON. Colonne componenti e quantità da configurazione, niente costo/vendita/importo/margine. Incidenza esplicita prevale sul driver, anche a zero: cambiare driver non cancella l'incidenza.
- Componenti Gamma: ricerca `ArticoloGammaPicker` del preventivatore riusata; codice diretto verificato sul catalogo. Descrizione/U.M./peso dal catalogo reale, lettura batch 150. Peso per unità base solo con dato Gamma e incidenza disponibili; niente peso ricostruito dall'articolo tecnico storico.
- Codice non presente: componente manuale con codice fornitore e badge. Riusata la stessa `ArticoloInDefinizioneDialog` in modalità opzionale `soloAnagrafica`, senza leve/totali di vendita. Default del preventivo conservato. Costo unitario del componente adattato con quantità 1; campi manuali salvati senza prezzo, ricarico o margine.
- Duplica: nuovo codice prefisso/progressivo e copia di tutti i campi nuovi dei componenti, note incluse; mai `articolo_id`. Non copia ID/date dei componenti. Una copia parziale produce errore esplicito, non un messaggio di successo completo.
- Nuovo/Duplica/modifiche/eliminazione: gate anagrafiche preesistente e linea abilitata sul profilo; RLS esistente resta controllo database. Non introdotti nuovi permessi.

## Compatibilità del preventivatore

La diagnosi ha trovato `fetchKit`/`fetchKitsWithComponenti` usati anche fuori dalle schermate kit. Cambiarne direttamente il risultato avrebbe rotto `addBloccoDaKit` e `AggiungiBloccoDialog` (dipendono ancora dall'articolo tecnico e dai campi storici).

- Le nuove schermate/API non leggono o scrivono `articolo_id`, famiglia enum e specifiche storiche; sola eccezione `famiglia` nell'INSERT, per il NOT NULL esistente, coerente col codice famiglia se corrisponde all'enum, altrimenti `ALTRO`.
- Le letture precedenti sono isolate nel ponte `src/lib/kit-legacy.ts`; negli unici due chiamanti è cambiato soltanto l'import. Handler/flusso/prezzi del preventivo non modificati. Cache nuova `kit-lista-v2`/`kit-v2` separata da `kits-with-comp` storica.
- **Limite voluto di questa fetta:** il percorso “Da kit” dei preventivi non è ancora passato al nuovo motore. Nuovi componenti senza articolo_id e modifiche delle specifiche nuove non vengono consumati dal percorso storico. Non usarli nei documenti di produzione finché la tappa dedicata non collega il nuovo motore ai preventivi.
- Nessuna famiglia creata di iniziativa per Showroom/Edilizia/Fotovoltaico: il database contiene oggi soltanto le 6 di Sistema MADE; le altre linee mostrano “Nessuna famiglia attiva” e non permettono creazione finché non configurate.

## Verifiche

- `bun test`: **1160 pass, 0 fail**, 150 file, 3750 asserzioni.
- `tsgo -b --noEmit`: uscita 0, nessun errore.
- Compilazione automatica: `build OK` (controllo 19:13:19 UTC).
- Guardia AST `tests/linee-preventivo.test.ts` verde: nessun confronto diretto con i codici linea fuori dal catalogo; nessun comportamento specifico scritto nei chiamanti.
- Test concreti: quattro prefissi/progressivi, enum e configurazione, unità/etichette, sole linee abilitate, conversione manuale/Gamma, patch anagrafica senza prezzi, specifiche numeriche italiane, override zero, ponte enum, errore di codice duplicato, duplicazione completa, lettura Gamma `[150,1]` senza join/listini.
- Playwright con gli stessi componenti in pagina temporanea (poi **rimossa**), dati sintetici e risposte di prova: lista/creazione/editor a **320, 375, 390, 768, 1280, 1920px**; overflow orizzontale 0 in tutte le misure, nessun errore runtime.
- Flusso a ogni misura: codice proposto SM-2 → codice SM-1 rifiutato → creazione SM-2 riletta nella lista → editor → codice non Gamma → finestra manuale → salva descrizione/U.M./costo/listino → descrizione riletta nell'editor. Showroom verificato senza campi driver, con “Quantità per kit”.
- Fotografie lista/nuovo/editor a 375 e 1280 esaminate; anche manuale e Showroom. Archivio `docs/verifiche/fm90-kit-1b/`: dieci PNG.
- Tentativo di sessione personale con `lovable auth-session --json --self`: nessun account corrispondente, sessione non ottenuta. Quindi **form reali autenticati, ricerca Gamma autenticata e salvataggio end-to-end nel DB non verificati**; le prove interattive usano dati e risposte simulati, non vengono presentate come prove di autenticazione.
- Lettura database finale: 3 kit, 6 famiglie, 33 componenti (30 Gamma + 3 manuali), invariati. Nessun dato di prova salvato nel database.

## Residui da trattare nella 1c

| Residuo | Dove / uso attuale |
|---|---|
| `kit.famiglia` enum | INSERT nuovo kit per vecchio NOT NULL; letture nel ponte e `AggiungiBloccoDialog` |
| `kit.tipo_struttura`, `spessore`, `h_max`, `passo`, `passo_um`, `isolante` | Conservati nel DB; nessuna scrittura dalle nuove schermate; vecchio picker blocchi legge ancora spessore |
| `kit_componenti.articolo_id` | Conservato nel DB; solo ponte storico `kit-legacy.ts` e inserimento kit nel preventivo |
| Default SQL `LEGACY-<uuid>` | Rimasto nel DB perché questa fetta non ha migrazioni; nessuna nuova creazione/duplicazione lo usa |
| `FAMIGLIE_KIT`, `FAMIGLIA_LABEL` | Restano in `incidenza.ts`: chiamante applicativo `src/components/preventivatore/AggiungiBloccoDialog.tsx` |
| `getCostoNettoCorrente`, `getPrezzoVendita`, `calcolaRigaKit`, `calcolaTotaliKit` | Restano in `kit-api.ts`; `calcolaRigaKit` chiamata da `addBloccoDaKit` soltanto per incidenza (fonte prezzi resta Gamma). Primi due hanno import residuo in `preventivi-api.ts` ma nessuna chiamata esterna diretta; `calcolaTotaliKit` nessun chiamante applicativo esterno |
| `ArticoloConListini`, `FasciaListino`, `RigaCalcolata`, `TotaliKit` | Tipi storici per funzioni residue e picker precedenti |
| `src/components/kit/ArticoloPicker.tsx` | Vecchio picker articolo tecnico, non più usato dalle schermate kit |
| `src/components/preventivatore/ArticoloPicker.tsx` | Vecchio picker conservato, nessun import applicativo trovato; valutare rimozione dedicata |
| `kit-legacy.ts` | Ponte di compatibilità per `AggiungiBloccoDialog` e `addBloccoDaKit`, da ritirare solo quando il nuovo percorso documento è pronto |

La 1c non deve eliminare dipendenze ancora vive senza prima portare il loro chiamante al nuovo motore. Prezzi del nuovo motore kit restano esclusi dalla 1b e arrivano nella tappa 3.

## File modificati

- `src/routes/_app/kit.index.tsx`
- `src/routes/_app/kit.$id.tsx`
- `src/components/kit/NuovoKitDialog.tsx`
- `src/components/kit/ComponenteKit.tsx`
- `src/components/kit/SpecificheKitFields.tsx`
- `src/components/preventivatore/ArticoloInDefinizioneDialog.tsx`
- `src/components/preventivatore/AggiungiBloccoDialog.tsx` (solo import del ponte)
- `src/lib/kit-api.ts`
- `src/lib/kit-config.ts`
- `src/lib/kit-legacy.ts`
- `src/lib/incidenza.ts`
- `src/lib/preventivi-api.ts` (solo import del ponte)
- `src/lib/AGENTS.md`
- `tests/kit-configurazione.test.ts`
- `tests/kit-motore.test.ts`
- `docs/regole/kit.md`
- `docs/verifiche/fm90-kit-1b.md`
- `docs/verifiche/fm90-kit-1b/*.png` (10 fotografie)
- `roadmap.md`

Root AGENTS saturo e non riscritto: decisione tecnica salvata nella regola di `src/lib/AGENTS.md`. Nessuna modifica finale al file generato delle route, nessuna nuova route persistente, nessuna migrazione.