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

## Grafico (FM100 fetta 2)
Fonte unica: `costruisciGrafoCerved` (`src/lib/cerved-grafo.ts`, puro, browser e server). Riusa `testoRuoloCerved`, `statoSocietaCerved`, `raggruppaSocietaCerved`, `eventiSoggettiCerved` (`cerved-collegati.ts`): nessuna formula nuova.

**Nodi** (centro livello 0; legati direttamente al centro livello 1; società collegate tramite un esponente e soci principali livello 2 — vale il livello più basso trovato):
- soci (`persona`/`societa`/`societa_estera`), titolari effettivi, esponenti, società collegate, partecipazioni, soci principali delle società socie (`solo_nome`).

**Unione**: stesso soggetto in più fonti = un nodo. Chiavi: codice fiscale normalizzato, poi id Cerved (`IDPerson`/`IDCompany`, e `SubjectId`), sempre **separate per famiglia persona/società**: una ditta individuale ha il CF del titolare ma resta un nodo società distinto (stessa regola di cerved.server: id persona e id società non si mescolano). I `solo_nome` si uniscono a una persona del report solo con nome identico normalizzato (maiuscolo, senza accenti e spazi doppi) e sono aggiunti dopo tutte le altre fonti. Il centro (P.IVA/CF dell'anagrafica del report) non si duplica mai e non riceve eventi.

**Archi**: uno per coppia di nodi, con `etichette` e `tipi` (`socio`, `titolare_effettivo`, `esponente`, `societa_collegata`, `partecipazione`, `socio_principale`) e `in_corso` (vero se almeno un legame è in corso; per i ruoli `testoRuoloCerved().inCorso`). Etichette: soci/partecipazioni percentuale (+ diritto se diverso da PROPRIETA'); titolare "Titolare effettivo — quote N%" (POSSESSO_QUOTE) o "— poteri di amministrazione" (POTERI_…); esponenti/società collegate il testo del ruolo. Società collegata con esponente non riconosciuto: arco dal centro.

**Stato** società da `statoSocietaCerved`: tono verde (o descrizione "Attiva") → attiva; codice T → cessata; tono rosso → procedura; altro → non_indicato. Persone: non_indicato.
**Eventi**: `eventi_negativi === true` della società → "Eventi negativi segnalati da Cerved"; più i testi di `eventiSoggettiCerved` (perCf e altri) abbinati per codice fiscale.

**Chiavi fiscali** (`chiaviFiscaliGrafo`, `chiaveFiscaleValida`): gemello della normalizzazione SQL di `public.riconcilia_lead_clienti` — P.IVA = sole cifre (`pivaCifre`) valida se 11 cifre e non 102730/102729; altrimenti CF = `trim` maiuscolo valido se 11 o 16 caratteri. Centro escluso, persone incluse.

**Dati MADE** (`datiMadeGrafoCerved`, `src/lib/cerved/cerved-grafo.functions.ts`): clienti con P.IVA o CF fra le chiavi (tutti, anche più per chiave). Fido = `getFidoAttuale`; esposizione = `clienti.totale_rischio` (stessa della scheda cliente); scaduto/oltre 60 = `public.scaduto_semaforo_batch` (`eur_scaduto`/`eur_grave`); sede = `stores.nome`. `riepilogoGruppoMade` somma per cliente distinto separando "questo cliente".

**Visibilità**: il Light Report si legge con la RLS dell'utente (`ultimoLightReportDiEntita`, la stessa lettura di `useLightReportEntita`); se non lo vede → nessun dato. Chi vede Cerved vede grafico e dati MADE (decisione di Andrea). `visibile` = l'utente vede il cliente con la propria RLS: solo allora "Apri scheda".
