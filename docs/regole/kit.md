# Kit — motore unico (FM90)

## Livelli e fonte unica

- LINEA (`linea_preventivo`, lo stesso enum del documento) → FAMIGLIA (`kit_famiglie`, per linea) → KIT (codice univoco globale) → COMPONENTI.
- Un solo motore per Sistema MADE, Showroom, Edilizia e Fotovoltaico. Le differenze sono configurazione in `LINEE_PREVENTIVO[linea].kit` (`src/lib/linee-preventivo.ts`), mai condizioni sul codice linea sparse nei chiamanti; vale anche `linee-preventivo.md`.
- Una famiglia è univoca per `(linea, codice)`; ordine e attivazione sono configurabili. Lettura come i kit (`auth_consulta_preventivi`), gestione con `auth_puo_gestire_anagrafiche_prev`, secondo fattore FM44.

## Unità e incidenza

- Una riga componente esprime la quantità dell'articolo per **una unità base** del kit.
- Senza BASE di regola, l'incidenza esplicita prevale sempre sul driver, anche se è zero. I driver sono soltanto il ripiego quando l'incidenza non è scritta.
- Sistema MADE: base predefinita `mq`, etichetta `Incidenza per {um}`. Altre linee: base `kit`, etichetta `Quantità per kit`.

## Catalogo Gamma e manuale

- Aggancio al catalogo reale `articoli_gamma` tramite `articolo_codice = articoli_gamma.codice`, non all'anagrafica tecnica `articoli`.
- Se il codice non è nel catalogo, il componente è manuale: il codice è un codice articolo fornitore. Campi e significati identici alla riga manuale “in definizione” di `righe_preventivo`: `codice_articolo_fornitore`, `descrizione`, `um`, `fornitore_id`, `marca`, `costo`, `listino_fornitore`; `note` facoltative.
- Il backfill usa il codice Gamma solo se esiste nel catalogo; altrimenti conserva codice, descrizione e unità dell'articolo storico, senza inventare costo, marca o listino.

## Configurazione per linea

| Linea | Prefisso | Base | Colonne componente | Specifiche |
|---|---|---|---|---|
| Sistema MADE | SM | mq | ruolo, lato, strato, tipo_driver, valore_driver, incidenza | tipo_struttura (testo), spessore_mm (numero), h_max_m (numero), isolante (testo) |
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
- Transizione 1b conclusa dalla tappa 3 FM91: inserimento nel preventivo ora tramite kit-api e motore semplice; ponte kit-legacy ritirato.

## Kit semplice a righe (FM91)

Decisione di Andrea: questo è il metodo principale, in sostituzione della gestione di parametri, varianti e regole a sei operandi. Il codice e i dati precedenti restano per compatibilità; non sono riproposti nella scheda.

- Ogni riga conserva `n_pezzi`, `passo`, `passo_2`, `consumo`, `lati`, `confezione`, `sfrido`, `riga_rif`, `peso_unitario`. Colonne nullable aggiunte dalla **0253_fm91_kit_semplice.sql**, senza backfill o cambi RLS. Passi/confezione positivi, pezzi/consumo/lati/peso non negativi, riferimento intero da 1; sfrido può essere negativo.
- Quantità per unità base: `BASE × N_PEZZI × CONSUMO × LATI ÷ PASSO ÷ PASSO_2 ÷ CONFEZIONE + SFRIDO`. Vuoti = 1, sfrido vuoto = 0. BASE = 1 senza collegamento, altrimenti quantità finale della riga collegata divisa per il suo N. pezzi (vuoto = 1). `riga_rif` è l'ordine della riga nello stesso kit, non un ID né una FK.
- Fonte unica: `calcolaKitRegole` in `kit-regole.ts`; precedenza **semplice → regola con BASE → incidenza esplicita → driver**. Basta uno dei primi otto campi, anche zero, per attivare il metodo semplice; il solo peso non lo attiva. Nessun arrotondamento. Riferimenti inesistenti, cicli, divisori zero e valori non finiti producono quantità null ed errore italiano sulla riga; quelle indipendenti continuano.
- Quantità sempre UM primaria Gamma. Confezione è solo il divisore scritto quando UM1 è già confezione (CO/1000, sacco NR/10 kg, rotolo RT/90 ml), mai dedotto dai metadati. Peso per unità base = quantità × peso unitario; `totalePesoKit` somma i pesi noti e conta righe senza peso. Peso zero è noto; errori indicano totale parziale.
- `LINEE_PREVENTIVO[linea].kit.calcoloSemplice`: `completo` mostra tutti i campi, `solo_quantita` solo N. pezzi con etichetta «Quantità per kit» e peso. Nessun confronto di linea nei chiamanti. Configurazione precedente conservata per il codice nascosto.
- Tabella compatta da 1024px, schede Articolo/Calcolo/Risultato sotto 1024px; quantità/pesi calcolati a sei decimali massimi. Campi numerici a quattro decimali quando non in modifica, valore pieno al focus, virgola e nessuno zero finale. Il focus/uscita senza cambiamenti non salva; nessun arrotondamento dei dati. Celle salvate all'uscita; riferimenti tramite menu delle altre righe. Modifica e aggiunta aprono `RigaKitDialog`, Gamma tramite picker condiviso, manuale tramite finestra in definizione in modalità anagrafica. Ordine nuovo = massimo + 1. Anteprima solo dal motore; errori dei campi impediscono il salvataggio.
- «Calcola dalla riga»: spiegazione completa condivisa sotto il campo della finestra e nell'icona informazioni della tabella/schede (mouse, tastiera e tocco). La riga nuova senza calcolo mostra in grigio «Compila almeno un campo di calcolo (es. N. pezzi o Consumo)», non un errore rosso. Nessuna parola “driver” visibile nella scheda semplice.
- Nessuna sezione Parametri/Prova parametri né operandi nella scheda. Letture dei parametri precedenti mantenute solo per eventuali vecchie regole. Le righe con `variante_ruolo` restano senza comandi. Incidenza storica conservata e calcolata come prima, ma mai inseribile a mano nella finestra. Passo e U.M. passo non sono più nelle specifiche di testata; i valori storici nascosti sono conservati anche al salvataggio delle specifiche visibili.
- `normalizzaPatchSempliceKit`, chiamato da `normalizzaPatchRegoleKit`, valida tutte le scritture API e le copie senza duplicare formule. Duplicazione conserva i nove campi e segnala anche gli errori di validazione dopo la creazione del kit; non è una transazione atomica.
- Permessi di gestione identici: anagrafiche + linea abilitata; RLS/secondo fattore invariati. Import escluso; preventivi collegati dalla tappa 3 seguente.

## Kit nel preventivo (FM91)

- «Da kit» legge kit-api e kit_famiglie con RLS utente/secondo fattore invariati. Elenco per famiglia, codice/nome, solo linea documento; controllo linea ripetuto prima delle scritture. Cache condivisa kit-lista-v2, nessuna lettura dell'anagrafica tecnica.
- calcolaKitRegole è la sola fonte dell'incidenza; quantità = quantitaDaIncidenza(incidenza, mq). Incidenza salvata completa; quantità a due decimali, come il percorso esistente di ricalcolo del blocco. Ordine componente conservato, nome/descrizione tecnica/unità del kit nella testata.
- Gamma: campiRigaGammaPreventivo condivisa con la scelta ArticoloGammaPicker, prezzi batch dal dispatcher FM71, priorità cantiere identica, sconti/maggiorazione/extra/costo identici; descrizione/UM Gamma, UM1. Aliquota nullable, come una nuova riga Gamma: nessuna nuova regola fiscale.
- Manuale: tipo manuale (non intestazione kit), dati in definizione, costo totale da costo unitario del componente, listino fornitore e prezzo inizialmente vuoto come una nuova manuale; nessuna vendita a fasce.
- Peso salvato = totale riga (peso_unitario kit × quantità, altrimenti Gamma). pesoUnitarioRigaPreventivo conserva il peso importato sulle righe con ruolo_kit durante letture e cambi mq; righe Gamma ordinarie conservano il comportamento precedente. Importo/costo/peso ricalcolati tramite fonti uniche.
- ruolo_kit text nullable, migrazione 0254_fm91_kit_ruolo_preventivo.sql: etichetta grigia sopra la descrizione in tabella/schede, copiato nei duplicati interni; escluso da PDF/email e dalla conversione in ordine Gamma. Nessun backfill.
- Errori del motore o codice Gamma non disponibile: riga saltata con ordine/descrizione/motivo nel dialog finale, mai quantità zero silenziosa. Dipendenze errate segnalate anch'esse; inserimento parzialmente fallito segnala il blocco già creato, nessuna pulizia distruttiva.
- kit-legacy, due picker tecnici non usati, funzioni/tipi di prezzo kit a fasce e costanti famiglia senza chiamanti ritirati; colonne storiche DB conservate. Nessuna modifica ai documenti esistenti.

## Motore a regole (FM91) — storico, non più metodo principale

- Fonte unica TypeScript: `src/lib/kit-regole.ts`, funzione pura `calcolaKitRegole`. Collegata all'anteprima della scheda kit dalla 2b1; import e percorso “Da kit” restano esclusi. Se servirà un calcolo SQL, sarà un gemello documentato di questo modulo, non una seconda logica autonoma.
- Quantità per **una unità base** = `BASE × MOLTIPLICA ÷ DIVIDI_1 ÷ DIVIDI_2 ÷ CONFEZIONE + AGGIUNTA`. Nessun arrotondamento intermedio o finale: si arrotonda solo in visualizzazione.
- Operandi testuali: numero con punto/virgola decimale; `PARAM:CODICE` (A–Z, 0–9, underscore); `RIGA:n` (ordine numerico univoco nello stesso kit). `RIGA:guide`/`RIGA:montanti` sono soltanto nomi descrittivi nell'esempio Excel: si salvano gli ordini numerici effettivi.
- Al salvataggio `normalizzaOperandoKit` converte la virgola in punto, elimina spazi esterni e rende i vuoti `null`; rifiuta formule libere e operandi malformati. Sarà riusata dalle fette 2b/2c, che gestiranno le scritture.
- Vuoti: MOLTIPLICA, DIVIDI_1, DIVIDI_2 e CONFEZIONE = 1, AGGIUNTA = 0. BASE vuota disattiva tutta la regola; BASE `0` la attiva. Precedenza: regola con BASE → incidenza esplicita (zero incluso) → driver storico (`calcIncidenzaFromDriver`).
- La quantità è **sempre nell'unità primaria dell'articolo Gamma (`articoli_gamma.um`, UM1)**. CONFEZIONE è un divisore manuale, soltanto quando UM1 è una confezione: viti CO/1000, sacco NR/10 kg, rotolo RT/90 ml. Niente fallback dai metadati Gamma. Il driver storico può ricevere la propria confezione esplicita dal chiamante, ma il motore non la ricava da Gamma e non interpreta UM2.
- Parametri: `kit_parametri` (numero oppure scelta numerica); ordine dei valori **default → `imposta_parametri` della variante → valori esterni**. Vince l'ultimo; valori non finiti, codici sconosciuti o scelte fuori elenco producono errori.
- Varianti: `kit_varianti`, al massimo una predefinita per kit; scelta per ID o predefinita se non specificata. I ruoli di `kit_varianti_articoli` sostituiscono le righe con `variante_ruolo`, che non salvano un articolo fisso o campi manuali. Un ruolo mancante/non univoco è un errore esplicito, mai quantità zero.
- Gli articoli della variante sono Gamma oppure manuali con gli stessi campi dei componenti; nessun prezzo viene calcolato. `RIGA:n` usa la quantità finale della dipendenza, a prescindere dall'ordine degli elementi in input; cicli, righe inesistenti e divisioni per zero sono errori italiani sulla riga e sulle dipendenze coinvolte.
- Output: ordine, articolo risolto Gamma/manuale, quantità per unità, fonte (`regola`, `incidenza`, `driver`) ed eventuale errore. Su errore quantità `null`, mai `NaN`/`Infinity` o zero silenzioso; righe indipendenti continuano a essere calcolate.
- Schema FM91 additivo: sei operandi nullable e `variante_ruolo`, ordine univoco per kit, parametri/varianti/articoli per ruolo. Permessi e trigger aggiornamento come `kit_componenti`, inclusa restrittiva FM44; nessun dato esistente modificato, nessun parametro/variante di prova creato.

## Scheda parametri e regole — FM91 2b1 (storico, sostituito dalla scheda semplice)

- Configurazione unica: Sistema MADE `regole: complete`, `parametri: true`; altre linee `regole: solo_base`, `parametri: false`. Stesso motore, nessun confronto di linea nei chiamanti.
- Parametri: creazione/modifica/eliminazione e frecce d'ordine con gate anagrafiche + linea abilitata, RLS invariata. Codice maiuscolo univoco nel kit, numeri italiani, scelta numerica con elenco separato da punto e virgola. Eliminazione/rinomina segnala tutte le righe referenti e richiede conferma; nessuna sostituzione automatica degli operandi.
- Sei operandi con inserimento numerico oppure menu di parametri/altre righe; riferimenti visualizzati tramite etichetta, mai da scrivere a mano. Frase descrittiva in `kit-regole-ui`, senza calcolo duplicato. Tutte le scritture componenti, inclusa duplicazione, passano da `normalizzaOperandoKit` attraverso l'adattatore condiviso.
- Anteprima immediata da `calcolaKitRegole`, anche prima del salvataggio del campo (salvato all'uscita); valori “Prova i parametri” solo locali. Quantità UM1 con sei decimali massimi e virgola, fonte e messaggi italiani del motore. BASE attiva attenua incidenza/driver senza cancellarli.
- Schede sotto 1024, tabella con operandi in una seconda riga da 1024; larghezza limitata per evitare campi dilatati a 1920. Parametri e form senza comandi per chi legge soltanto; valori di prova restano disponibili perché non scrivono dati.
- Duplicazione copia parametri e sei operandi; copie parziali hanno errore esplicito. Riordino salva gli ordini con verifica di ogni riga, segnala eventuali salvataggi parziali. Le FK CASCADE eliminano componenti/parametri/varianti insieme al kit.
- `variante_ruolo` soltanto letto: la riga mostra “articolo da variante: …” senza comandi. Gestione varianti esclusa (2b2), import Excel escluso (2c); nessuna migrazione.