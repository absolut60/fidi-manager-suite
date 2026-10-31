# Analisi: regola "scaduto non incassato" e segnalazioni uniformi del fido

Solo analisi: ho letto codice e database, non ho modificato niente. I numeri vengono dal database di oggi, 31/10/2026.

## 1. Come si calcola oggi lo scaduto nel fido teorico (`get_fido_teorico_v2`)

Ci sono due conteggi diversi, tutti e due fatti riga per riga su `scadenze`:

- **`fermo`** fa scattare il profilo `patologico_scaduto_fermo` (coefficiente 0,20).
  - Righe con `stato_contabile='Aperta'`, importo > 0, senza ANTICIPO.
  - La fascia d'età viene dal testo Gamma `tempi_scadenza` (60-90 / 90-120 / oltre 120).
  - Il profilo scatta se la somma supera la soglia `fido_v2_soglia_residuo_eur` (500 €).
  - Gli ANTICIPO sono solo esclusi: non vengono compensati. RiBa e BOS non hanno un trattamento a parte.
- **`scad`** è lo scaduto canonico.
  - Righe con `categoria_scadenza_riga(...) = 'scaduto'`, quindi le rate chiuse in anticipo (FM54) sono già escluse.
  - Il totale si calcola con `calcola_scaduto(ssa non-anticipo, anticipi)`.
  - Serve solo per `patologico_insoluto_pesante` e per il testo degli impegni. Non ha soglia di giorni.
- **`clienti.scaduto` di Gamma non viene usato** dal teorico.
- **Promesse e piani di rientro non vengono considerati.** La tabella `piani_rientro` non ha importi né date. Nessuno dei clienti coinvolti ha un piano.
- **`clienti_scaduto_oltre_60()`** è un terzo conteggio, quello del recupero crediti.
  - Usa la stessa formula canonica, con soglia > 60 giorni sul ritardo massimo.
  - Esclude BOS e i clienti in gestione legale.

**Definizione canonica proposta, "scaduto oltre N giorni":**
- Le righe sono quelle di `scad`, la categoria canonica.
- Per ogni riga non-ANTICIPO si guardano i giorni: `CURRENT_DATE - data_scadenza`, oppure `giorni_ritardo` se manca la data.
- `scaduto_oltre_N = calcola_scaduto(somma righe non-ANTICIPO con giorni > N, somma di tutti gli ANTICIPO scaduti)`.
- Il cliente è coinvolto se `scaduto_oltre_N > fido_v2_scaduto_importo`.
- Le soglie sono configurabili: `fido_v2_scaduto_giorni` = 15 e `fido_v2_scaduto_importo` = 500. Oggi nessuna delle due chiavi esiste.
- Va in una sola funzione SQL, `scaduto_oltre_giorni(_cliente_ids)`. Il teorico, gli alert e l'interfaccia la riusano.

**Conteggio reale** (clienti attivi con fido > 0):

| Variante | Clienti | Fido | Scaduto oltre 15 gg |
|---|---:|---:|---:|
| Canonica (RiBa e BOS inclusi) | **46** | 869.000 € | 199.749 € |
| Senza RiBa | 43 | — | — |
| Senza BOS | 28 | — | — |

- Dei 46, 45 sono in regola `calcolo` con un teorico > 0: il teorico pubblicato complessivo è 843.500 €. Il restante è già bloccato. Nessuno è in gestione legale.
- La tua stima di 43 coincide con la variante "senza RiBa".

**Decisioni che servono:**
- **BOS:** il recupero crediti lo esclude. Escludendolo i clienti passano da 46 a 28.
- **RiBa:** una RiBa ancora "Aperta" dopo la scadenza può essere solo in attesa di esito. Va inclusa?

## 2. Come funziona oggi il cliente bloccato

- **Nel teorico:** se `clienti.bloccato` è vero, la regola è `cliente_bloccato`, il fido è 0 e la spiegazione dice "Cliente bloccato: nessun fido proposto.". La regola NON è tra le `REGOLE_NON_PROPONIBILI`, quindi il cliente resta proponibile.
- **Richiesta singola e proposta massiva:** il riferimento è 0. Un importo > 0 conta come extra, quindi chiede solo il motivo obbligatorio (componente dell'extra + CHECK `richieste_fido_motivo_extra_teorico_check`).
- **NON esiste nessun avviso rosso dedicato e nessuna autorizzazione specifica in approvazione.**
  - Nella pagina di approvazione e nel modulo della richiesta c'è solo il badge "Bloccato — motivo" del pannello rischio (`pannello-rischio-cliente.tsx`).
  - Il trigger `richieste_fido_guardia` non legge `bloccato`.
  - In `richieste_fido` non c'è nessuna colonna di autorizzazione.

Quindi il meccanismo da riusare va costruito, e varrà sia per i bloccati sia per lo scaduto.

## 3. Dove si vedono oggi le informazioni sul cliente (i 5 punti)

| Punto | File | Cosa mostra oggi |
|---|---|---|
| Alert fidi | `routes/_app/alert-fidi.tsx`, `lib/alert-fidi.ts` | tipo alert, consumo, stato richiesta |
| Proposta massiva | `proposta-fido-massiva-dialog.tsx` | nota del calcolo, extra protetto, profilo |
| Richiesta singola | `richiesta-fido-form-dialog.tsx` + `PannelloRischioCliente` | badge bloccato/legale, scaduto Gamma |
| Scheda cliente | `cliente-storico-fido-tab.tsx` → `FidoTeoricoNuovoBlocco` | consumo, spiegazione |
| Approvazione | `routes/_app/richieste.$richiestaId.tsx` + `PannelloRischioCliente` | semaforo, badge |

Per "acquisti sopra il previsto", "ordine grosso" e "uso pieno del fido" oggi non esiste nessuna segnalazione con nome. Ci sono solo `consumo_perc`, `fabbisogno`, `base` e `ordini_aperti` in `fido_teorico_cliente`.

**Fonte unica proposta:**
- **Nel database:** nuove colonne in `fido_teorico_cliente`, calcolate al ricalcolo in `get_fido_teorico_v2`:
  - `scaduto_oltre_n`, `scaduto_oltre_n_giorni`
  - `segnalazioni text[]`, con i codici `bloccato`, `scaduto_non_incassato`, `impegni_sopra_base`, `ordini_prevalenti`, `uso_pieno`
- **Nel codice:** in `src/lib/fido-segnalazioni.ts` una sola mappa codice → etichetta, gravità e testo, con gli importi presi dalla riga.
- **Nell'interfaccia:** un componente unico `SegnalazioniFido`, usato nei 5 punti.
- **Soglie da decidere:**
  - "ordini prevalenti": proposta ordini > 50% degli impegni.
  - "uso pieno": proposta `consumo_perc` ≥ soglia alert consumo.

## 4. Interazioni

- **Alert fidi:**
  - Serve un nuovo tipo `scaduto`. Nel database è testo, quindi non si tocca nessun tipo enumerato. Va aggiunto anche in `TipoAlertFido`.
  - Questo alert è sempre aperto finché vale la regola: niente "riproponi dal" e niente chiusura per richiesta decisa.
  - L'alert `riduzione` per questi clienti mostrerebbe un teorico di 0: va deciso se lasciarlo nascosto in favore dell'alert `scaduto`. Proposta: priorità allo scaduto.
- **Extra protetti 30 giorni:** secondo me lo scaduto prevale, cioè il riferimento resta 0 anche con un extra approvato. Va confermato. Oggi nessuno dei 46 ha un piano di rientro; gli incroci con gli extra protetti li verifico nella fetta 1.
- **Dormienti e persi:** per definizione non comprano; se hanno scaduto, lo scaduto prevale come regola. Il profilo resta quello calcolato e cambia solo la regola: il nome proposto è `scaduto_non_incassato`, valutato dopo `cliente_bloccato`.
- **Extra con motivo:** un importo > 0 con riferimento 0 è un extra. Il CHECK sul motivo resta così com'è. Si aggiunge l'autorizzazione esplicita.

## 5. Fette proposte

1. **Fetta 1, regola nel database** (migrazione + `fido-teorico.ts` + test):
   - funzione `scaduto_oltre_giorni`
   - regola `scaduto_non_incassato` in `get_fido_teorico_v2`, con fido 0 e spiegazione "Cliente con scaduto non incassato: X € da oltre 15 giorni"
   - colonne in `fido_teorico_cliente`
   - poi ricalcolo
2. **Fetta 2, segnalazioni uniformi** (`fido-segnalazioni.ts`, componente `SegnalazioniFido`, test): colonna `segnalazioni` calcolata al ricalcolo. Le soglie si decidono qui.
3. **Fetta 3, avviso e autorizzazione** (migrazione + modulo richiesta + pagina richiesta):
   - nuove colonne in `richieste_fido`: `autorizzazione_forzatura_da`, `_il`, `_motivo`
   - una regola nel trigger guardia: non si può approvare un importo > 0 su un cliente bloccato o con scaduto senza autorizzazione. Vale anche per i bloccati.
   - avviso rosso nel modulo e nella pagina di approvazione
4. **Fetta 4, i 5 punti:** `SegnalazioniFido` in Alert fidi, proposta massiva, scheda cliente, richiesta singola e approvazione. Nella proposta massiva il badge rosso è sulla riga.
5. **Fetta 5, alert:** tipo `scaduto` in `aggiorna_alert_fidi`, priorità sulla riduzione, pagina Alert fidi. Si fa solo la ricostruzione degli alert, con un riepilogo salvato prima.

**Rischi principali:**
- Cambiare la regola di questi clienti tocca il riferimento delle richieste già aperte.
- Le colonne nuove richiedono di pubblicare l'app.
- Il trigger guardia è condiviso: va provato con ogni ruolo.

**Non regressione:**
- La firma attuale (4700 / `49ddb9ab…`) CAMBIERÀ, perché 45 dei 46 clienti hanno profili inclusi nella firma (patologici, puntuali, ritardi). Il loro fido proposto passa a 0.
- Nuova verifica: la stessa query con il filtro in più `regola_applicata <> 'scaduto_non_incassato'` deve dare 4700 − 45 = **4655**. Prima della migrazione calcolo l'md5 atteso escludendo quei 45 `cliente_id`, poi lo confronto dopo il ricalcolo.
- Nella fetta 1 riporto l'elenco dei 45 clienti (codice, ragione sociale, teorico prima → 0).

## Decisioni richieste prima della fetta 1

1. BOS incluso o escluso (46 contro 28 clienti)?
2. RiBa ancora aperta dopo la scadenza inclusa?
3. Lo scaduto prevale sull'extra protetto 30 giorni?
4. L'autorizzazione è un passaggio in più: chi la dà? Proposta: l'approvatore, con una casella di conferma e un motivo, scritta sulla richiesta. Vale anche per i bloccati?
5. Soglie di "ordini prevalenti" e "uso pieno".
