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