# FM95 — Fetta 3b: file di prova, SDI e ordini a lead

## Perimetro e risultato

- Gli ordini trasformati da preventivi a lead mantengono il lead.
- «Nuovo ordine» permette sia cliente sia lead, usando gli stessi riferimenti obbligatori e la stessa creazione rapida dei preventivi.
- SDI editabile nei tre moduli anagrafici trovati, visibile nella scheda lead.
- Solo l'amministratore vede «File Gamma di prova» nel menu dell'ordine; nessuna voce nei preventivi. Finestra sovrapposta, pronta/non esportabile, descrizioni delle righe, problemi bloccanti prima degli avvisi, scarico solo senza blocchi.
- Nessuna RLS modificata, nessuno storico di esportazione, nessuno stato «esportato», nessuna pagina nuova nella lista Ordini. Nessuna pubblicazione.

## Migrazioni

1. `drizzle/migrations/0264_fm95_ordini_lead.sql`: `CREATE OR REPLACE` della definizione attuale di `trasforma_preventivo_in_ordine(uuid,jsonb)`, aggiunta di `lead_id` alle colonne della testata e `v_prev.lead_id` ai valori.
2. `drizzle/migrations/0265_fm95_ordini_lead_correzione_verbatim.sql`: ripristino immediato di una trascrizione accidentale dell'assegnazione IVA (`t.imp + t.iva - t.imp` invece dell'originale `t.iva`) introdotta nella 0264. È stata applicata una nuova migrazione correttiva, senza riscrivere una migrazione già applicata. Non sono stati trasformati documenti tra le due applicazioni.

**Stato finale verificato sul DB:** rimuovendo le sole aggiunte `, lead_id` e `, v_prev.lead_id`, la definizione è identica parola per parola alla funzione letta prima della 0264. Impronta MD5 finale: `561ad7e3d27bb97b3113821e6d36b738`. `prosecdef=true`, firma/search_path/gate invariati; ACL invariata, EXECUTE authenticated e service_role, non PUBLIC/anon. Campi FM94, sede, tre riferimenti, chiusura, stato Ordinato e quantità derivate invariati.

La guardia `tests/esportazione-gamma-motore.test.ts` conserva il confronto 0261→0263 e aggiunge quello 0263→stato finale 0264+0265.

## CHECK e riaggancio FM71

Il CHECK reale `preventivi_cliente_lead_alternativi` è:

```sql
CHECK ((cliente_id IS NULL) OR (lead_id IS NULL))
```

Vieta cliente e lead contemporaneamente per **tutti** i tipi, ordini inclusi; non impone la presenza di almeno uno dei due. Non è stato modificato.

`trg_lead_riaggancia_preventivi_cliente` chiama `lead_riaggancia_preventivi_cliente()` dopo il passaggio `lead.cliente_id NULL→non NULL`; aggiorna ogni documento con `lead_id=NEW.id`, senza filtro `tipo`, quindi anche gli ordini. Copia `cliente_id`, conserva `lead_origine_id`, svuota `lead_id`, senza cambiare condizioni o righe. SDI non viene copiato nel cliente.

### Prove annullate

- `tests/sql/fm95-ordini-lead.sql` sul **DB reale**: INSERT di lead e preventivo/ordine temporanei, CHECK con entrambi i destinatari rifiutato; **ROLLBACK**. Riaggancio live esplicitamente saltato perché `sandbox_exec` non ha UPDATE su lead/preventivi.
- Sul **PostgreSQL isolato temporaneo**: stesse strutture ed enum ricavati dal DB, stesso CHECK e stessa funzione/trigger di riaggancio; test completo con `ROLLBACK` superato, preventivo e ordine riagganciati con origine e riferimenti conservati.
- `tests/sql/fm95-trasformazione-lead.sql` sul clone isolato: chiamata alla **definizione reale e finale della RPC**, copia lead/sede/riferimenti/quattro campi riga FM94 e stato origine Ordinato verificati con `ROLLBACK`. Gate MFA/visibilità, numerazione e riepilogo IVA sono sostituiti da stub nel clone: questa prova verifica la copia SQL, **non** i permessi reali né la numerazione/IVA in produzione.
- Conteggi reali finali: zero lead con ragione sociale `FM95 SOLO ROLLBACK`, zero preventivi con numero `FM95-%`. Nessun dato di prova rimasto.

## Punti di anagrafica lead trovati

| Punto | Modifica |
|---|---|
| `src/components/lead/nuovo-lead-dialog.tsx` | Campo SDI nel modulo completo di creazione; payload a `creaLead`. |
| `src/routes/_app/lead.$leadId.tsx` | SDI nel form completo, inizializzazione dal DB e salvataggio normalizzato; lettura nella sezione Identità dell'anagrafica. |
| `src/components/preventivatore/SoggettoPreventivoPicker.tsx` | SDI nel «+ Nuovo lead» rapido, comune a creazione/cambio destinatario di preventivi e ordini. |
| `src/components/preventivatore/LeadPreventivoDialog.tsx` | Non modificato: incorpora la scheda completa lead, quindi eredita automaticamente il campo. |

I restanti punti `lead` trovati sono letture, cambi stato/assegnazioni, collegamento cliente, privacy e generazione da ingressi esterni: non sono moduli di modifica dell'anagrafica; invariati.

Componente condiviso `CampoCodiceSdi`; normalizzazione unica in `src/lib/codice-sdi.ts`: maiuscolo, tutti gli spazi rimossi, massimo sette caratteri. Avviso solo se non vuoto e lunghezza diversa da sette, senza bloccare; incolla normalizzato prima del limite. Aiuto: «Per i privati lascialo vuoto: in Gamma verrà usato 0000000». Creazione completa (`lead-crea`) e rapida (`campiLeadRapido`) salvano il dato normalizzato, o NULL quando vuoto. L'API della conversione cliente non è stata toccata.

## File modificati/creati

**Applicazione**
- `src/lib/codice-sdi.ts` (nuovo)
- `src/components/lead/campo-codice-sdi.tsx` (nuovo)
- `src/components/lead/nuovo-lead-dialog.tsx`
- `src/lib/lead-crea.ts`
- `src/lib/soggetto-preventivo.ts`
- `src/components/preventivatore/SoggettoPreventivoPicker.tsx`
- `src/components/preventivatore/NuovoPreventivoDialog.tsx`: unica differenza `consentiLead={!isOrdine}` → `consentiLead`.
- `src/routes/_app/lead.$leadId.tsx`
- `src/routes/_app/preventivatore.$id.tsx`
- `src/components/preventivatore/FileGammaDiProvaDialog.tsx` (nuovo)
- `src/components/preventivatore/AGENTS.md`: regola tecnica di download di prova.

**Test/documenti**
- `tests/codice-sdi.test.ts` (nuovo)
- `tests/fm95-gate.test.ts` (nuovo)
- `tests/esportazione-gamma-motore.test.ts`
- `tests/fm95-gamma.browser.py` e `tests/fixtures/fm95-gamma-ui.tsx` (nuovi, fixture isolata non importata dall'app finale)
- `tests/sql/fm95-ordini-lead.sql`, `tests/sql/fm95-trasformazione-lead.sql` (nuovi)
- `roadmap.md`, questo rapporto.
- Due migrazioni e relativi registro/snapshot generati dallo strumento. Types rigenerati automaticamente, senza differenze finali di schema.

La route temporanea `/verifica-fm95` serviva solo per il collaudo ed è stata rimossa; nessuna route finale nuova.

## Finestra e download

La voce usa il controllo esistente `useAuth().hasRole('amministratore')`; la finestra ripete lo stesso controllo e non parte con utenti non amministratori. Le letture usano soltanto il client autenticato/RLS esistente, mai un client privilegiato.

Catena: `caricaDatiEsportazioneGamma([id])` → `costruisciEsportazioneGamma` → preparazione BIFF8 e Blob prima di abilitare lo scarico → al clic `salvaFile`, fonte unica del salvataggio browser già usata nell'app. MIME `application/vnd.ms-excel`, nome da `nomeFileGamma`, foglio Sheet1. Preparare il Blob prima del clic preserva l'attivazione su Safari/iOS; lì il helper comune può proporre Condividi/Salva su File, su PC download diretto.

Stato di caricamento, errore e Riprova; nessuna preparazione XLS con bloccanti. Finestra a tutta altezza sui telefoni, contenitore compatto su tablet/PC; problemi nel proprio scorrimento, azioni sempre raggiungibili. Riquadri `RiquadroAnagrafica` con sola barra sinistra e colori semantici.

## Test e fotografie

- **1.322 test verdi**, zero fallimenti, 162 file: 1.313 precedenti più 9 nuovi (cinque SDI, tre guardie, uno copia SQL finale).
- **Typecheck automatico OK** nei controlli della piattaforma; nessun comando manuale di build/typecheck.
- `tests/fm95-gate.test.ts` verifica la guardia effettiva della creazione lead e valuta l'espressione reale che monta la finestra: ordine+amministratore sì; preventivo o manage/direzione/store_manager/showroom/responsabile_showroom no. Verifica anche la condizione reale che rende un ordine scaricabile.
- Playwright a **320, 375, 390, 768, 1280, 1920 px**: SDI incompleto/completo, finestra pronta e bloccata, descrizioni per riga, blocchi prima degli avvisi, assenza del pulsante con bloccanti, creazione rapida lead in Nuovo ordine e salvataggio bloccato senza riferimenti, zero overflow/errori.
- Download effettuato con `expect_download` a tutte e sei le misure; file non vuoto, intestazione binaria CFB/BIFF8 corretta. Fotografie in `/tmp/browser/fm95b/` (temporanee, non link di download dell'app).
- La prova fotografica usa componenti reali con fixture e risposte locali; **non verifica salvataggio lead o download con una sessione amministratore reale**. Sessione personale del richiedente assente, nessun accesso ad account altrui mintato.

## Prova reale ORD-104/26 (sola lettura)

Dati dell'ordine, righe, articoli, acquisti della sede, fornitori e cliente letti dal DB reale con il ruolo tecnico di sandbox; elaborati dai moduli reali. Nessuna correzione ai dati, nessun nuovo ordine, nessuna scrittura. Non equivale a una verifica della RLS/sessione amministratore nel browser.

- **Esportabile**: un ordine esportato, zero bloccanti.
- **Due avvisi** `descrizione_troncata`: due descrizioni Gamma oltre 70 caratteri vengono accorciate nel file.
- XLS generato e riletto con XLSX: **30.208 byte**, BIFF8, foglio Sheet1.
- Prime righe (dati anagrafici e NOTE personali oscurati):

| T/R | Documento | Anagrafica | NOTE | Articolo | QTA1 | PRZ1 |
|---|---|---|---|---|---:|---:|
| T | MD-F-ORDINE | [oscurata] | ORD-104/26 · [resto oscurato] | | | |
| R | MD-F-ORDINE | [oscurata] | | MAP111111 | 2 | 7 |
| T | MD-F-ORDINE | [oscurata] | ORD-104/26 · [resto oscurato] | | | |
| R | MD-F-ORDINE | [oscurata] | | KNI730060 | 100 | 3,83 |
| T | MD-F-ORDINE | [oscurata] | ORD-104/26 · [resto oscurato] | | | |

Il file reale non è copiato nei documenti del progetto né allegato, perché contiene anagrafica; rimane solo nell'area temporanea di verifica.

## Scostamenti e limiti

1. Due migrazioni invece di una: errore di trascrizione nella 0264 corretto subito con 0265; stato finale **verbatim** salvo lead_id, comprovato sul DB. Nessuna migrazione già applicata modificata.
2. Il CHECK vieta la coesistenza, ma ammette entrambi NULL: è la regola preesistente, lasciata invariata come richiesto.
3. RPC/riaggancio con ROLLBACK provati integralmente sul clone isolato; sul DB reale il ruolo tecnico consente INSERT/SELECT ma non UPDATE/EXECUTE riservati. Nessun permesso ampliato o RLS alterata. Per la verifica live completa serve una sessione autorizzata; limite mantenuto esplicito.
4. Download riusa `salvaFile` anziché una seconda implementazione, per mantenere il comportamento iPhone/iPad dell'app.

**Non pubblicato.**