# Cerved — procedure concorsuali e atti di Conservatoria (FM99)

Fonte unica: `normalizzaLightReportXml` (`src/lib/cerved/cerved.server.ts`, funzione interna `leggiEventiConcorsuali`). Nessun altro punto ricalcola questi flag.

## Dove stanno nell'XML (verificato sugli 80 Light Report salvati)
- **Procedure concorsuali**: `/LightReport/Bankruptcy/BankruptcyBlock/SingleBankruptcyBlock`. Un blocco ha `SubjectReport` (true = l'azienda del report) e, se riguarda un collegato, `OtherSubsidiaries` (nome, TaxCode). Ogni `SingleBankruptcyBlock` → una riga di `procedure_concorsuali`: soggetto/CF da `AgainstItemInformation/AgainstItemCompany`, `EventDescription` (tipo), `EventCode`, `ProcedureClassification`, `Court`, `OpeningDate` (data_apertura), `RIIscriptionDate` (data_iscrizione_ri), `ProcedureRegistrationDate`/`ProcedureRegistrationNumber` (quando presenti), `Rejected` (respinta).
- **Atti di Conservatoria** (nonostante il nome): `/LightReport/AgreedWindingUpProcedures/ItemAgreeWindingUpProcedure/AgreedWindingUpProcedure`. Un item (con `SubjectReport` e `ItemInformation/Company`) può contenere più atti. `PrejudicialEventType` = pregiudizievole; `FormalityEvent/EventDate|EventDescription`; `DepartmentInformation/DepartmentDescription` (conservatoria); `AmountEnrolledInEuros`/`CapitalAmountInEuros` (0 → null); `Beneficiary/Company/CompanyName` oppure `Person` FirstName LastName; `NumberRegistrationInfo/RegistrationNumber`.
- I tag omonimi dentro `PositionCompany/.../Aziendaslim` e `HoldingsFromShareholders` appartengono a società collegate: mai letti per l'azienda.

## Cancellati
Un atto è cancellato se `AnnotationData` ha contenuto (un `<AnnotationData/>` vuoto NON cancella), oppure la descrizione contiene `**CANC**`, oppure `Note` inizia con "CANCELLAZIONE". `data_cancellazione` da `AnnotationData/Date`, altrimenti dalla data gg/mm/aaaa della Note. Il suffisso `**CANC**` è tolto dalla descrizione.

## Flag (stessa forma di prima)
- `eventi_negativi.azienda.procedure` = `fallimenti_propri` = `protesti.procedure` = `protesti.fallimento` = esiste una procedura concorsuale con `riguarda_azienda` e non respinta (`respinta !== true`, FM99-B); null se `Bankruptcy` manca. I quattro restano allineati.
- `eventi_negativi.azienda.pregiudizievoli` = esiste un atto proprio, pregiudizievole e non cancellato; null se `AgreedWindingUpProcedures` manca.
- `possibile_omonimia` invariato.

## Propri vs collegati
Procedure e atti pregiudizievoli non cancellati con `riguarda_azienda=false` diventano descrizioni brevi in `eventi_negativi.collegati[].eventi` (collegato con lo stesso codice fiscale; a parità di CF si preferisce il collegato non persona). Le istanze respinte compaiono con il suffisso «(istanza respinta)» e non contano come procedure in corso. Se il soggetto non è fra i collegati va in `eventi_negativi.altri_soggetti`. La chiave `eventi` compare solo sui collegati che hanno eventi.

## Rilettura dei report salvati
`rileggiLightReportSalvati` (solo amministratore, Impostazioni → Prova Cerved → "Rileggi report salvati") rilegge l'XML originale: `cerved_fotografie.chiamata_id` → `cerved_chiamate.risposta.contenuto_xml` (tutte le 80 righe attuali hanno questo collegamento); ripiego: ultima chiamata `document_retrieve` ok il cui `risposta.request_id` è un `request_id` di `cerved_report` dello stesso `id_soggetto`. Aggiorna solo `dati` della stessa riga, nessuna chiamata a Cerved, idempotente.

## Schermate (FM99-B) — fonte unica `src/lib/cerved-presentazione.ts`
- `elementoEventiAzienda`: rosso solo per procedure proprie in corso, atti propri pregiudizievoli non cancellati (testo «Procedura concorsuale: …», «Atti pregiudizievoli: N») o protesti/eventi di crisi/CIGS veri; grigio «Solo atti informativi» se ci sono solo atti propri informativi/cancellati o istanze respinte; altrimenti verde «Nessuno segnalato».
- `elementoEventiRelazionati` + `soggettiRelazionatiConEventi`: rosso se un collegato o altro soggetto ha procedure in corso o atti pregiudizievoli attivi (più i flag esistenti di persone e società collegate); al massimo 2 nomi + «e altri N».
- Ripiego sulle fotografie granulari per procedure/fallimenti/pregiudizievoli solo se il Light Report non ha né Bankruptcy né AgreedWindingUpProcedures (`ripiegoEventiGranulari`): un valore vero diventa grigio «da verificare (dato non distinto tra azienda e collegati)», mai rosso.
- `vociProcedureAtti` alimenta la sezione «Procedure e atti di Conservatoria» (componente `procedure-atti-cerved`): azienda prima, poi collegati, più recenti in alto; badge In corso / Istanza respinta / Pregiudizievole / Informativo / Cancellato il.
- `eventiSoggettiCerved` (cerved-collegati) aggancia gli eventi per codice fiscale a società ed esponenti nella sezione «Esponenti e società collegate»; i non riscontrati e `altri_soggetti` vanno in «Altri soggetti con eventi».
