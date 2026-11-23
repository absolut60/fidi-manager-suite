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

Ritocco fetta 3: si cercano anche le chiavi del **centro** (`chiaveFiscaleValida` su P.IVA/CF dell'anagrafica del report). Ogni riga ha `chiave_centro`. Cliente: `e_questo_cliente` = stesso id. Lead: `e_questo_cliente` = trovato sulle chiavi del centro ("questo lead è già cliente MADE"). La composizione delle righe è in `componiClientiGrafo` (pura, testata).

## Schermata (FM100 fetta 3)
Componente unico `GrafoCollegatiCerved` (`src/components/cerved/grafo-collegati-cerved.tsx`), nella scheda Cerved di cliente e lead **subito prima** di "Esponenti e società collegate", in entrambe le impaginazioni (pagina larga: riga intera), solo con Light Report. Con il solo centro non mostra nulla. Dati: `costruisciGrafoCerved` + `datiMadeGrafoCerved` (chiave query `["cerved-grafo-made", entita, id]`); nodo↔clienti per `chiaveFiscaleValida(codice_fiscale) === chiave`, centro ↔ clienti con `chiave_centro`. `d3-force` serve solo alla disposizione (300 passi prima del disegno, centro fisso); il disegno è SVG nostro con colori del tema.

- **Riepilogo MADE** (`riepilogoGruppoMade`): solo se c'è almeno un cliente MADE oltre a questo; per il cliente anche "Gruppo incluso questo cliente"; per il lead "Questo lead è già cliente MADE: …".
- **Grafico | Elenco**. Nodi: centro primario; persona cerchio; società rettangolo; estera tratteggiata; solo nome cerchio piccolo tratteggiato. Bordo verde attiva, grigio opaco cessata, rosso procedura o eventi. Targhetta "MADE" (+ bloccato / in legale). Archi pieni in corso, tratteggiati cessati; oltre 30 nodi etichette solo per il nodo sotto il puntatore o selezionato.
- **Filtri**: "Legami cessati (N)" spento all'inizio (nasconde archi cessati e nodi rimasti isolati, mai il centro; vale anche per l'Elenco); "Evidenzia clienti MADE" e "Evidenzia eventi negativi" attenuano gli altri nodi.
- **PC (pointer fine)**: trascinare un nodo lo sposta e lo lascia fissato; trascinare lo sfondo sposta la vista; zoom con + / − / Centra e Ctrl/⌘ + rotella (la rotella da sola scorre la pagina); "Riordina" libera i nodi fissati; clic senza movimento (< 4 px) o Invio da tastiera apre il dettaglio.
- **Telefono/tablet (pointer coarse)**: nella scheda anteprima ferma (la pagina continua a scorrere), un tocco apre la finestra a tutto schermo con le stesse funzioni; `touch-action: none` solo lì (un dito trascina nodo o vista, due dita zoom).
- **Dettaglio** (finestra sovrapposta, dal basso sul telefono): nome intero, tipo, codice fiscale, stato, dettagli, eventi in rosso, legami con l'altro capo; per ogni cliente MADE ragione sociale, codice, sede, fido, esposizione, scaduto, oltre 60 gg, Bloccato / In legale.
- **"Apri scheda cliente" solo se `visibile`** (l'utente vede il cliente con la propria RLS) e non è questo cliente.
