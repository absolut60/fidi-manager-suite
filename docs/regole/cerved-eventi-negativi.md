# Cerved — procedure concorsuali e atti di Conservatoria (FM99)

Fonte unica: `normalizzaLightReportXml` (`src/lib/cerved/cerved.server.ts`, funzione interna `leggiEventiConcorsuali`). Nessun altro punto ricalcola questi flag.

## Dove stanno nell'XML (verificato sugli 80 Light Report salvati)
- **Procedure concorsuali**: `/LightReport/Bankruptcy/BankruptcyBlock/SingleBankruptcyBlock`. Un blocco ha `SubjectReport` (true = l'azienda del report) e, se riguarda un collegato, `OtherSubsidiaries` (nome, TaxCode). Ogni `SingleBankruptcyBlock` → una riga di `procedure_concorsuali`: soggetto/CF da `AgainstItemInformation/AgainstItemCompany`, `EventDescription` (tipo), `EventCode`, `ProcedureClassification`, `Court`, `OpeningDate` (data_apertura), `RIIscriptionDate` (data_iscrizione_ri), `ProcedureRegistrationDate`/`ProcedureRegistrationNumber` (quando presenti), `Rejected` (respinta).
- **Atti di Conservatoria** (nonostante il nome): `/LightReport/AgreedWindingUpProcedures/ItemAgreeWindingUpProcedure/AgreedWindingUpProcedure`. Un item (con `SubjectReport` e `ItemInformation/Company`) può contenere più atti. `PrejudicialEventType` = pregiudizievole; `FormalityEvent/EventDate|EventDescription`; `DepartmentInformation/DepartmentDescription` (conservatoria); `AmountEnrolledInEuros`/`CapitalAmountInEuros` (0 → null); `Beneficiary/Company/CompanyName` oppure `Person` FirstName LastName; `NumberRegistrationInfo/RegistrationNumber`.
- I tag omonimi dentro `PositionCompany/.../Aziendaslim` e `HoldingsFromShareholders` appartengono a società collegate: mai letti per l'azienda.

## Cancellati
Un atto è cancellato se `AnnotationData` ha contenuto (un `<AnnotationData/>` vuoto NON cancella), oppure la descrizione contiene `**CANC**`, oppure `Note` inizia con "CANCELLAZIONE". `data_cancellazione` da `AnnotationData/Date`, altrimenti dalla data gg/mm/aaaa della Note. Il suffisso `**CANC**` è tolto dalla descrizione.

## Flag (stessa forma di prima)
- `eventi_negativi.azienda.procedure` = `fallimenti_propri` = `protesti.procedure` = `protesti.fallimento` = esiste una procedura concorsuale con `riguarda_azienda`; null se `Bankruptcy` manca. I quattro restano allineati.
- `eventi_negativi.azienda.pregiudizievoli` = esiste un atto proprio, pregiudizievole e non cancellato; null se `AgreedWindingUpProcedures` manca.
- `possibile_omonimia` invariato.

## Propri vs collegati
Procedure e atti pregiudizievoli non cancellati con `riguarda_azienda=false` diventano descrizioni brevi in `eventi_negativi.collegati[].eventi` (collegato con lo stesso codice fiscale; a parità di CF si preferisce il collegato non persona). Se il soggetto non è fra i collegati va in `eventi_negativi.altri_soggetti`. La chiave `eventi` compare solo sui collegati che hanno eventi.

## Rilettura dei report salvati
`rileggiLightReportSalvati` (solo amministratore, Impostazioni → Prova Cerved → "Rileggi report salvati") rilegge l'XML originale: `cerved_fotografie.chiamata_id` → `cerved_chiamate.risposta.contenuto_xml` (tutte le 80 righe attuali hanno questo collegamento); ripiego: ultima chiamata `document_retrieve` ok il cui `risposta.request_id` è un `request_id` di `cerved_report` dello stesso `id_soggetto`. Aggiorna solo `dati` della stessa riga, nessuna chiamata a Cerved, idempotente.
