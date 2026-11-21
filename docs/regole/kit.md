# Kit — stato attuale

## Livelli

- LINEA (`linea_preventivo`) → FAMIGLIA (`kit_famiglie`, tramite `kit.famiglia_id`) → KIT (codice univoco globale, senza default) → RIGHE semplici (`kit_componenti`).
- Un solo motore per tutte le linee; le differenze sono solo configurazione in `LINEE_PREVENTIVO[linea].kit` (`src/lib/linee-preventivo.ts`), mai confronti sul codice linea nei chiamanti.
- Lettura con `auth_consulta_preventivi`, gestione con `auth_puo_gestire_anagrafiche_prev` + linea abilitata, secondo fattore FM44.

## Righe

- Articolo Gamma (`articolo_codice` = `articoli_gamma.codice`) oppure manuale (`codice_articolo_fornitore`, `descrizione`, `um`, `fornitore_id`, `marca`, `costo`, `listino_fornitore`), con `ruolo` (categoria) e `note`.
- Campi di calcolo: `n_pezzi`, `passo`, `passo_2`, `consumo`, `lati`, `confezione`, `sfrido`, `riga_rif`, `peso_unitario`. Unico validatore: `normalizzaPatchSempliceKit` (kit-api).

## Formula

- Fonte unica `calcolaKitRegole` (`src/lib/kit-regole.ts`). Quantità per unità base, sempre in UM1 Gamma: `BASE × N_PEZZI × CONSUMO × LATI ÷ PASSO ÷ PASSO_2 ÷ CONFEZIONE + SFRIDO`. Vuoti = 1, sfrido vuoto = 0. BASE = 1, oppure con `riga_rif` la quantità della riga collegata (ordine nello stesso kit) divisa per il suo N. pezzi.
- Senza alcun campo di calcolo la quantità è null («Compila almeno un campo di calcolo (es. N. pezzi o Consumo)»). Riferimenti inesistenti, cicli, divisori zero: quantità null ed errore italiano; nessun arrotondamento.
- Confezione è solo il divisore scritto quando UM1 è una confezione, mai dedotto.

## Peso

- Peso per unità base = quantità × `peso_unitario`; `totalePesoKit` somma i pesi noti e conta le righe senza peso.

## Specifiche di testata

- Sistema MADE: `tipo_struttura` (testo), `spessore_mm` (numero), `h_max_m` (numero), `isolante` (testo), salvate in `kit.specifiche`; la duplicazione copia solo le specifiche configurate. Altre linee: nessuna specifica.

## Scheda kit

- Tabella da 1024px, schede sotto; quattro decimali in visualizzazione, valore pieno in modifica. Modifica/aggiunta con `RigaKitDialog`. `calcoloSemplice`: `completo` (Sistema MADE) o `solo_quantita`.

## Da kit nel preventivo

- Legge kit-api, solo kit della linea del documento; incidenza da `calcolaKitRegole`, quantità = `quantitaDaIncidenza(incidenza, mq)`. Righe Gamma con `campiRigaGammaPreventivo` e prezzi dal dispatcher FM71; manuali come riga in definizione. Peso riga = `peso_unitario` × quantità. `ruolo_kit` sulla riga del preventivo. Righe in errore saltate e segnalate.

## Import/export kit (FM91)

- **Regola di fondo (Andrea): template, export e import sempre allineati.** Le colonne (intestazione, campo, tipo, obbligatorio, solo controllo, aiuto) esistono SOLO in `src/lib/kit-excel.ts` (`COLONNE_KIT_EXCEL`); template, export, istruzioni e lettura si generano da lì. `MAPPA_DB_KIT`/`MAPPA_DB_KIT_COMPONENTI` elencano ogni colonna DB come colonna del file o «escluso: motivo»: un campo nuovo nei kit senza aggiornare il modulo fa fallire `tests/kit-excel.test.ts` (e il typecheck).
- Pagina /kit: «Importa da Excel», «Scarica template», «Esporta kit» accanto a «Nuovo kit», stessi gate (anagrafiche + linea abilitata); sotto 768px raccolti nel menu «Altro». L'export contiene i kit visibili col filtro linea corrente.
- File: foglio KIT (una riga per articolo, campi di testata ripetuti), ISTRUZIONI, VALORI (linee e famiglie attive dal database). LINEA per etichetta, FAMIGLIA per codice o nome. UM nell'export = unità Gamma. Template = kit reale SM-PAR-2L-75-50 se visibile, altrimenti esempio sintetico.
- INCIDENZA e PESO_PER_UM sono formule di solo controllo, mai importate. La riga collegata si trova per CODICE_KIT + ORDINE con SUMPRODUCT e si legge con INDIRECT: una SUMIFS sulla colonna INCIDENZA creerebbe un riferimento circolare strutturale in Excel. Valori verificati con ricalcolo LibreOffice = motore.
- Import: intestazioni tolleranti (maiuscole, spazi, accenti, asterisco), numeri con virgola o punto, colonne in qualsiasi ordine. Validazioni per CODICE_KIT: testata coerente su tutte le righe, linea riconosciuta e abilitata, linea uguale al kit esistente, famiglia attiva della linea, ORDINE intero unico, numeri con `numeroCampoKit`, motore `calcolaKitRegole` (righe collegate inesistenti, cicli, divisori). Codice in `articoli_gamma` = Gamma (descrizione/UM del file ignorate), altrimenti manuale con DESCRIZIONE_ARTICOLO obbligatoria e UM consigliata. INCIDENZA del file diversa di oltre 0,000001 = avviso, non blocca.
- Anteprima per kit (Nuovo / Aggiorna con righe sostituite, righe, manuali, avvisi, errori); i kit con errori sono esclusi. Salvataggio con `public.importa_kit_excel` (SECURITY INVOKER, RLS e secondo fattore invariati, linea controllata con `auth_linee_abilitate`), una chiamata atomica per kit: aggiorna testata e sostituisce tutte le righe, oppure crea. Specifiche della scheda conservate; per gli articoli manuali fornitore/marca/costo/listino passano dalla riga precedente con stesso ordine e codice. Kit non nel file intatti; un kit fallito non annulla gli altri. Le righe dei preventivi sono copie e non cambiano.

Storico: motore a regole FM91 e campi FM90 rimossi in FM92 (migrazione 0257).
