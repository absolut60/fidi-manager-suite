# Cerved — soci, titolari effettivi e partecipazioni (FM100)

Fonte unica: `normalizzaLightReportXml` (`src/lib/cerved/cerved.server.ts`). Percorsi **ancorati alla radice** `LightReport` (mai `trova()` globale: dentro le società collegate esistono tag con nomi simili). I tre campi sono sempre presenti: array vuoto se il contenitore manca.

**Valori grezzi, nessuna decodifica inventata**: `criterio`, `codice_diritto`, `stato_codice`, `diritto` restano come nell'XML.

## Soci — `soci[]`
Percorso: `LightReport/Shareholders/ShareholdersList/Shareholder` (`ShareholdersList` segue `CompanySheet`, che non si legge).
Sullo `Shareholder`: `LinkCode` → `codice_diritto`, `DescriptionLinkCode` → `diritto`, `PercentageShares` → `percentuale`, `ValueOfPart` → `valore_quota`, `CurrencyValueOfPart` → `valuta`.

`ShareholderItem` ha UNO di tre figli:
- `IndividualInformation` → `tipo: "persona"`: `IDPerson` → `id_cerved`, `SubjectId`, `Name` (o `LastName FirstName`) → `nome`, `TaxCode`.
- `Aziendaslim` (s minuscola) → `tipo: "societa"`: `CompanyInformation` (`IDCompany`, `CompanyName`, `CompanyForm` testo → `forma`, `TaxCode`), `ActivityStatus`/`ActivityDescription`/`ActivityStatusStartDate` → `stato_*`, `Ateco2025` (attr `Code` prima della `/`) → `ateco_*`, `NegativeEvents`, `Group`, `MainShareholders/ShareHolderName` → `soci_principali[]`.
- `CompanyInformation` diretto → `tipo: "societa_estera"`: `IDCompany`, `CompanyName`, `Nationality`; nessun codice fiscale.

## Titolari effettivi — `titolari_effettivi[]`
Percorso: `LightReport/BeneficialOwnersV2/BeneficialOwner`. Attributo `Strategy` → `criterio` (es. `POSSESSO_QUOTE`, `POTERI_AMMINISTRAZIONE_DIREZIONE_RAPPRESENTANZA`); `FlagStatus` PF → `persona: true`, PG → `false`, altro → null; `nome` = `LastName FirstName`, altrimenti `CompanyName`; `TaxCode`, `IdSubject` → `id_soggetto`, `CumulativeSharePercentage` → `percentuale`.

## Partecipazioni — `partecipazioni[]`
Percorso: `LightReport/HoldingsFromShareholders/Holdings/Holding`. Società in `Holding/AziendaSlim` (**S maiuscola**, diversa da `Aziendaslim` dei soci): `CompanyInformation` (`IDCompany`, `CompanyName`, `CompanyForm`, `TaxCode`), `ActivityStatus`, `ActivityDescription`, `ActivityStatusStartDate`, `Ateco` (attr `Code` prima della `/`), `Revenue`/`Profit` (stesso formato di `SocietaCollegataCerved`, già in euro), `NegativeEvents`.
Su `Holding`: `SignificantShare` → `significativa`, `DeedDate` → `data_atto`; `Shares/Share/SharesPercentage` → `percentuale`, `Share/RightType/Right` (testo) → `diritto`. Si legge il primo `Share`.

Percentuali con `num()` (decimale con punto, es. `66.26`). Nessun campo preesistente cambia (confronto su 81 report salvati: identico).
