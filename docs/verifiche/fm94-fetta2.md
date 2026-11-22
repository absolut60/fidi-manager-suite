# FM94 — Fetta 2: ordini

## Database
- Applicata `drizzle/migrations/0262_fm94_ordini_data_consegna.sql`: solo `ALTER TABLE public.preventivi ADD COLUMN data_consegna date`.
- Verifica DB: tipo date, nullable YES, nessun default; zero documenti con data compilata dopo la verifica. Nessuna modifica di dati, RLS o permessi.
- `trasforma_preventivo_in_ordine` non modificata. Impronta attuale della definizione: `091bcd3963d9bb931eeb2406df256780`.
- Tipi rigenerati dalla piattaforma.

## Comportamento
- Data di consegna facoltativa solo in Nuovo ordine e nella testata ordine. Salvataggio all'uscita dal campo tramite mutation di testata esistente.
- La modificabilità generale degli ordini resta invariata: soltanto la nuova data e il fornitore Gamma sono modificabili per i ruoli di scrittura preesistenti; nessun allargamento di RLS. Salva e protezione uscita includono queste scritture.
- `fornitoreRigaOrdine` è la fonte unica: scelta di riga, altrimenti preferenziale Gamma, altrimenti null. Lookup dei nomi raggruppato per blocco; nessuna query del nome per singola riga.
- Sotto la descrizione delle sole righe Gamma valorizzate dell'ordine: ragione sociale oppure avviso ambra. Matita apre una finestra sovrapposta; preferenziali prima, poi fornitori collegati; ricerca generica identica alla finestra manuale e ora condivisa.
- La scrittura del fornitore invia esclusivamente `fornitore_id`, senza ricalcolare prezzi, quantità, costo o altri campi. Righe manuali invariate.

## Stringhe
Tutte le trasformazioni usano `etichetteDocumento`; sui preventivi restituisce il testo originale.

| Punto | Preventivo | Ordine |
|---|---|---|
| Nuovo: titolo e pulsante | Nuovo preventivo / Crea preventivo | Nuovo ordine / Crea ordine |
| Nuovo: placeholder | Titolo del preventivo | Titolo dell'ordine |
| Nuovo e testata: sede | Scegli la sede prima di salvare il preventivo. | Scegli la sede prima di salvare l'ordine. |
| Nuovo: lettura lead | Impossibile leggere il lead per il nuovo preventivo. Riprova. | Impossibile leggere il lead per il nuovo ordine. Riprova. |
| Nuovo: gruppo linea | Linea del preventivo | Linea dell'ordine |
| Nuovo: esiti | Preventivo creato; Preventivo creato, ma il primo blocco non è stato aggiunto. Puoi aggiungerlo dalla scheda.; Errore creazione preventivo | Stessi testi con Ordine/ordine |
| Tipo documento (nuovo, testata e badge) | Preventivo | Ordine |
| Testata: alternativa | — Nessuna: è un preventivo principale | — Nessuna: è un ordine principale |
| Editor: Salva | Preventivo salvato | Ordine salvato |
| Editor: eliminazione | il preventivo; Preventivo eliminato | l'ordine; Ordine eliminato |
| Editor: titolo senza numero e Indietro | Nuovo preventivo; Preventivi | Nuovo ordine; Ordini |
| Editor: sola lettura | Testo preventivo confermato invariato | Ordine: altri campi in sola lettura. |
| Riepilogo: descrizione accessibile | Riepilogo dell'articolo per il cliente del preventivo | Riepilogo dell'articolo per il cliente dell'ordine |
| Riepilogo: costo | Costo ultimo (usato nel preventivo) | Costo ultimo (usato nell'ordine) |
| Riepilogo: riquadro | In questo preventivo | In questo ordine |
| Cantiere lead | I cantieri del lead non sono ancora collegabili al preventivo. | I cantieri del lead non sono ancora collegabili all'ordine. |
| Kit: errore selezione | Scegli un kit della linea del preventivo | Scegli un kit della linea dell'ordine |
| Genera documento | Preventivo; dal preventivo | Ordine; dall'ordine |
| PDF ufficiale e nome file | Preventivo; preventivo | Ordine; ordine (comportamento già coerente, ora fonte condivisa) |
| Email: titolo | Invia il preventivo per email | Invia l'ordine per email |
| Email: intestazione, oggetto di ripiego, toast | Preventivo; Preventivo numero; Preventivo inviato a… | Ordine; Ordine numero; Ordine inviato a… |
| Email: avviso modello | Nessun modello "Invio preventivo" attivo: scrivi il testo a mano. | Nessun modello "Invio ordine" attivo: scrivi il testo a mano. |
| Email: nomi e testi dei modelli | Testi originali | Sostituzione nominale prima di espandere i segnaposto; `preventivo.numero`/`preventivo.titolo` preservati |

I testi riferiti al preventivo di origine restano correttamente «preventivo»; duplicazione, chiusura/evasione e disclaimer di validità sono già esclusivi dei preventivi. «Aggiungi blocco» e «Aggiungi riga» invariati.
Metadati dell'editor descrivono ora entrambe le tipologie, senza modificare logica di caricamento.

## File
- Nuovi: `src/lib/etichette-documento.ts`, `src/lib/fornitori-riga-ordine.ts`, `src/components/preventivatore/FornitoreRigaOrdine.tsx`, `tests/ordini-gamma.test.ts`.
- Modificati: `src/lib/esportazione-gamma.ts`, `src/lib/pdf-export.ts`, `src/routes/_app/preventivatore.$id.tsx`.
- Componenti: `NuovoPreventivoDialog`, `TestataPreventivo`, `RigheTable`, `RiepilogoArticoloDialog`, `BadgeTestata`, `GeneraDocumentoDialog`, `InviaPreventivoEmailDialog`, `AggiungiBloccoDialog`, `CantiereTestata`, `ArticoloInDefinizioneDialog` (solo riuso ricerca fornitori).
- Migrazione 0262 e metadati generati, `src/integrations/supabase/types.ts`, `roadmap.md`, questo rapporto.
- Nessuna modifica al gate canonico `preventivoModificabile`, alle funzioni SQL esistenti o ai calcoli.
- Budget AGENTS.md esaurito (10237/10240): nessuna regola preesistente modificata. Nuove fonti uniche segnalate qui: etichetteDocumento e fornitoreRigaOrdine/ricerca fornitori condivisa.

## Verifica
- `bun test tests`: **1263 pass, 0 fail**, 4238 aspettative, 158 file.
- Controlli automatici piattaforma: build OK; verifica tipi obbligatoria al commit. Nessun controllo tipi manuale eseguito, in conformità ai vincoli della piattaforma.
- Playwright a **320, 375, 390, 768, 1280, 1920**: data salvata e riletta; scelta collegata e ricerca generica salvate/rilette; PATCH della riga con solo fornitore_id; nuovo ordine con titolo corretto e data; preventivi senza campo e senza comando fornitore; nessun overflow pagina o errore runtime. Tabelle con scorrimento orizzontale preesistente invariato.
- Fotografie sotto `/tmp/browser/fm94-fetta2/`, incluse ordine, fornitore, nuovo ordine, preventivo e nuovo preventivo per ogni larghezza. Pagina temporanea eliminata.
- Limite: sessione personale non disponibile (`auth-session --self`: nessun account corrispondente). Prove con risposte locali intercettate, **non** verifica autenticata persistita/RLS end-to-end. Nessun ordine o altro dato di prova scritto nel DB.
- Data usa il medesimo controllo nativo date della testata; il formato del controllo può dipendere dalle impostazioni del browser, come gli altri campi data esistenti. Date in sola lettura formattate it-IT. Stampa PDF/email live non eseguite.