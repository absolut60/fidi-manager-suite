# Kit — motore unico (FM90)

## Livelli e fonte unica

- LINEA (`linea_preventivo`, lo stesso enum del documento) → FAMIGLIA (`kit_famiglie`, per linea) → KIT (codice univoco globale) → COMPONENTI.
- Un solo motore per Sistema MADE, Showroom, Edilizia e Fotovoltaico. Le differenze sono configurazione in `LINEE_PREVENTIVO[linea].kit` (`src/lib/linee-preventivo.ts`), mai condizioni sul codice linea sparse nei chiamanti; vale anche `linee-preventivo.md`.
- Una famiglia è univoca per `(linea, codice)`; ordine e attivazione sono configurabili. Lettura come i kit (`auth_consulta_preventivi`), gestione con `auth_puo_gestire_anagrafiche_prev`, secondo fattore FM44.

## Unità e incidenza

- Una riga componente esprime la quantità dell'articolo per **una unità base** del kit.
- L'incidenza esplicita prevale sempre sul driver, anche se è zero. I driver sono soltanto il ripiego quando l'incidenza non è scritta.
- Sistema MADE: base predefinita `mq`, etichetta `Incidenza per {um}`. Altre linee: base `kit`, etichetta `Quantità per kit`.

## Catalogo Gamma e manuale

- Aggancio al catalogo reale `articoli_gamma` tramite `articolo_codice = articoli_gamma.codice`, non all'anagrafica tecnica `articoli`.
- Se il codice non è nel catalogo, il componente è manuale: il codice è un codice articolo fornitore. Campi e significati identici alla riga manuale “in definizione” di `righe_preventivo`: `codice_articolo_fornitore`, `descrizione`, `um`, `fornitore_id`, `marca`, `costo`, `listino_fornitore`; `note` facoltative.
- Il backfill usa il codice Gamma solo se esiste nel catalogo; altrimenti conserva codice, descrizione e unità dell'articolo storico, senza inventare costo, marca o listino.

## Configurazione per linea

| Linea | Prefisso | Base | Colonne componente | Specifiche |
|---|---|---|---|---|
| Sistema MADE | SM | mq | ruolo, lato, strato, tipo_driver, valore_driver, incidenza | tipo_struttura (testo), spessore_mm (numero), h_max_m (numero), passo (numero), passo_um (testo), isolante (testo) |
| Showroom | SR | kit | ruolo, incidenza | nessuna per ora |
| Edilizia | ED | kit | ruolo, incidenza | nessuna per ora |
| Fotovoltaico | FV | kit | ruolo, incidenza | nessuna per ora |

## Transizione 1a

- Solo struttura nuova e backfill: nessuna schermata usa ancora questa configurazione, nessun cambiamento al calcolo o ai documenti.
- Sei famiglie dell'enum storico riportate come righe di Sistema MADE. I tre kit di prova sono conservati con codici `PROVA-1`…`PROVA-3`; Andrea li elimina dall'app quando opportuno.
- Restano tutte le colonne storiche e `articolo_id`; nessuna modifica a `blocchi_preventivo`, `righe_preventivo` o `preventivi`. La rimozione dei campi storici è esclusa da questa tappa.
- Codice tecnico transitorio predefinito `LEGACY-<uuid>` per non bloccare la creazione dalle schermate attuali; la duplicazione omette il codice originale per riceverne uno nuovo. I prefissi del catalogo sono configurazione futura, non cambiano ancora i codici generati dalle schermate.
- Il backfill non è sincronizzazione continua: la 1b porterà le schermate ai nuovi campi; in 1a le modifiche delle specifiche/componenti continuano sul percorso storico.

## Schermate nuove — fetta 1b

- Lista raggruppata per linea → famiglia (ordine da `kit_famiglie`), filtro multiplo persistente con `useFiltriPagina`; opzioni e gestione limitate alle linee abilitate del profilo, lette con `useLineeUtente`. Una sola linea: filtro nascosto. Sono considerate le linee abilitate anche se non ancora attive per creare preventivi.
- Card con codice, nome, unità base e numero componenti; niente fasce, costi, prezzi, margini o totali commerciali.
- Creazione: linea predefinita se abilitata, famiglie attive della linea, codice modificabile proposto dal prefisso nel catalogo e progressivo massimo + 1; nessun uso del default `LEGACY`. Univocità definitiva tramite vincolo DB e messaggio italiano; la duplicazione riprova fino a tre volte in caso di concorrenza sul codice.
- Il codice è globalmente univoco: la proposta considera tutti i codici visibili con quel prefisso, anche eventuali codici personalizzati assegnati ad altre linee. Le specifiche sono generate dal catalogo e salvate solo in `specifiche` con numeri normalizzati; linea non modificabile dopo creazione. Famiglia enum compilata coerentemente soltanto nell'INSERT per rispettare il vecchio NOT NULL, non più aggiornata.
- Componenti nuovi: `articolo_codice` Gamma oppure campi manuali; mai scritture `articolo_id`. Metadati Gamma in batch da 150 (descrizione/U.M./peso), nessuna join ai vecchi articoli o listini. Fallimento della ricerca esatta non trasforma la riga in manuale.
- Codice assente dal catalogo: manuale, con etichetta e la stessa `ArticoloInDefinizioneDialog` del preventivo in modalità anagrafica (nessuna leva o margine). Il costo del componente è unitario; l'adattamento passa `quantita=1` alla finestra condivisa. Selezione Gamma cancella i campi manuali, ma conserva incidenza/driver/ruolo/note.
- Incidenza esplicita, incluso zero, prioritaria: cambiare driver/valore non la cancella. Il valore del driver è solo informativo quando l'incidenza non è scritta. Colonne e quantità derivano dalla configurazione; peso per unità base soltanto con peso Gamma e incidenza noti.
- Telefono/tablet sotto 1024: schede componenti. Da 1024: tabella; a 1280 colonne e azioni a larghezza fissa senza uscire dallo schermo.
- Transizione preventivi ancora separata: `kit-legacy.ts` conserva soltanto le letture storiche di `AggiungiBloccoDialog` e `addBloccoDaKit`, con chiave `kits-with-comp` invariata; nuove schermate usano `kit-lista-v2`/`kit-v2`. L'inserimento dei kit nuovi nei documenti non è migrato in 1b e va completato nella tappa dedicata prima di usarli in produzione nei preventivi.