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
- **Grafico | Elenco**. Nodi: centro primario; persona cerchio; società rettangolo; estera tratteggiata; solo nome cerchio piccolo tratteggiato. Bordo verde attiva, grigio opaco cessata, rosso procedura o eventi. Targhetta "MADE" (+ bloccato / in legale) sui nodi abbinati a clienti MADE, mai sul centro (il blocco cliente resta nel suo dettaglio). Archi come frecce (marker SVG del tema, stessa opacità/tratteggio) verso il capo `a`, accorciate fino al bordo del nodo di arrivo (cerchio o rettangolo) + 3 px; pieni in corso, tratteggiati cessati. Sulla freccia, sempre e a metà, solo le percentuali (`percentualiArco`, valori unici uniti con " · ") in una pastiglia; i ruoli compaiono, sotto la percentuale, solo per gli archi del nodo sotto il puntatore / toccato / a fuoco, in qualsiasi grafo. Etichette complete nel dettaglio e nell'Elenco.
- **Filtri**: "Legami cessati (N)" spento all'inizio (nasconde archi cessati e nodi rimasti isolati, mai il centro; vale anche per l'Elenco); "Evidenzia clienti MADE" e "Evidenzia eventi negativi" attenuano gli altri nodi.
- **PC (pointer fine)**: trascinare un nodo lo sposta e lo lascia fissato; trascinare lo sfondo sposta la vista; zoom con + / − / Centra e Ctrl/⌘ + rotella (la rotella da sola scorre la pagina); "Riordina" libera i nodi fissati; clic senza movimento (< 4 px) o Invio da tastiera apre il dettaglio.
- **Telefono/tablet (pointer coarse)**: nella scheda anteprima ferma (la pagina continua a scorrere), un tocco apre la finestra a tutto schermo con le stesse funzioni; `touch-action: none` solo lì (un dito trascina nodo o vista, due dita zoom).
- **Dettaglio** (finestra sovrapposta, dal basso sul telefono): nome intero, tipo, codice fiscale, stato, dettagli, eventi in rosso, legami con l'altro capo; per ogni cliente MADE ragione sociale, codice, sede, fido, esposizione, scaduto, oltre 60 gg, Bloccato / In legale.
- **"Apri scheda cliente" solo se `visibile`** (l'utente vede il cliente con la propria RLS) e non è questo cliente.

## Famiglie di legame ed etichette brevi (FM100, ridisegno leggibilità)
Fonte unica in `src/lib/cerved-grafo.ts`: `TABELLA_RUOLI_GRAFO` + `classificaRuoloCerved` (ruoli Cerved), `famigliaArco`, `etichettaArco` (sostituiscono `percentualiArco`/`ruoliArco`, eliminate). Ogni arco ha `legami[]` ({famiglia, breve, titolare?}). La prima regola della tabella che corrisponde vale (testo maiuscolo senza accenti).

| Fonte / ruolo Cerved | Famiglia | Etichetta |
|---|---|---|
| Socio dell'elenco soci | quote | "Socio N%" (o "Socio") |
| Partecipazione | quote | "Partecipa N%" |
| Titolare effettivo POSSESSO_QUOTE | quote | "Titolare effettivo" (solo se sull'arco non c'è già una quota) |
| Titolare effettivo POTERI_… | cariche | "Titolare effettivo" |
| Socio principale (soci delle società socie) | quote | "Socio" |
| SOCIO UNICO | quote | Socio unico |
| …ACCOMANDANTE / …ACCOMANDATARIO | quote | Accomandante / Accomandatario |
| SOCIO AMMINISTRATORE | quote | Socio amministratore |
| altri SOCIO (SNC, lavorante, non partecipa…) | quote | Socio |
| TITOLARE FIRMATARIO | quote | Titolare |
| …COLLEGIO SINDACALE, SINDACO EFFETTIVO/SUPPLENTE | altri | Sindaco |
| REVISORE (legale/unico/dei conti) | altri | Revisore |
| AMMINISTRATORE DELEGATO | cariche | Amm. delegato |
| AMMINISTRATORE UNICO / AMMINISTRATORE | cariche | Amministratore |
| CONSIGLIERE / CONSIGLIERE DELEGATO | cariche | Consigliere |
| VICE PRESIDENTE (anche CdA) | cariche | Vicepresidente |
| PRESIDENTE CONSIGLIO AMMINISTRAZIONE | cariche | Presidente CdA |
| LIQUIDATORE | cariche | Liquidatore |
| LEGALE RAPPRESENTANTE | cariche | Legale rappr. |
| MEMBRO CONSIGLIO/COMITATO DIRETTIVO | cariche | Membro direttivo |
| PROCURATORE (anche speciale) | altri | Procuratore |
| RESPONSABILE TECNICO / DIRETTORE TECNICO | altri | Resp. tecnico / Dir. tecnico |
| PREPOSTO… / INSTITORE | altri | Preposto / Direttore |
| ruolo non riconosciuto | altri | testo Cerved con sola iniziale maiuscola, max 18 caratteri |

Arco: famiglia = quote se c'è almeno un legame quote, altrimenti cariche, altrimenti altri. Etichetta = quote, poi cariche, poi altri, voci uniche unite con " · ", al massimo 2 + "+N". Testo completo con date solo nel dettaglio e nell'Elenco.

**Lead già in FidiManager** (`datiMadeGrafoCerved` → `lead`): con `supabaseAdmin`, lead con P.IVA/CF fra le chiavi (stessa normalizzazione), `cliente_id` NULL, escluso il lead della scheda; `visibile` = RLS dell'utente su `lead`. Composizione pura `componiLeadGrafo`. Se la chiave ha un cliente il nodo è "Cliente", mai "Lead" (`leadPerNodo`).

## Schermata — ridisegno leggibilità (sostituisce le voci su targhetta MADE, bordo verde e percentuali/ruoli al passaggio)
- **Frecce**: etichetta breve sempre visibile a metà freccia, in pastiglia (fondo `--background`, bordo sottile, 9,5 px). Colore per famiglia: quote `primary` spessore 2; cariche `warning` 1,5; altri grigio 1; punta dello stesso colore (un marker per famiglia). Cessato: tratteggiato e opacità 0,5. Verso: da chi detiene/ricopre verso l'azienda.
- **Nodi**: centro primario pieno; già cliente = fondo primario 15% + bordo primario + seconda riga "Cliente <codice>" (`rigaClienteNodo`), rossa con " · bloccato / in legale / scaduto non incassato" (rosso = bloccato, in legale o scaduto non incassato secondo la regola Alert fidi: `fido_teorico_v2.regola = 'scaduto_non_incassato'`, campo `scaduto_da_alert`; scaduto e oltre 60 gg restano solo nel dettaglio); già lead = fondo info 15% + "Lead"; altri fondo bianco. Persona cerchio, società riquadro. Nome su 2 righe da ~20 caratteri (`righeNome`). Bordo rosso = eventi/procedure; cessata grigia e sbiadita; niente bordo verde (lo stato resta nel dettaglio); nessun testo "MADE" nel disegno.
- **Dettaglio**: blocco cliente con badge "Cliente N"; blocco "Lead in FidiManager" (ragione sociale, stato, "Apri scheda lead" solo se visibile).
- **Legenda** (`LegendaGrafo`): PC sempre aperta sotto il grafico; telefono e schermo intero con pulsante "Legenda". Voci: azienda che stai guardando · "Cliente N" · "Lead" · persona · società · eventi negativi/procedure · cessata · quote/soci · cariche · altri incarichi · legame cessato · verso della freccia.
- **Elenco**: etichetta breve + testo completo sotto in piccolo; badge "Cliente N" o "Lead".

## Schermata — disposizione ampia e trascinamento stabile (FM101)
- **Disposizione** (`creaSimulazione(grafo, fascia)`): link 160 (200 se un capo ha livello ≥ 2); carica −900 con distanceMax 600; collisione 75 per il centro, 58 per gli altri (spazio per il nome), 2 iterazioni; velocityDecay 0,5. Fascia della tela (`fasciaTela`): larga se w/h ≥ 1,2 (forceX 0,012, forceY 0,05), alta se ≤ 0,8 (0,05 / 0,012), altrimenti normale (0,025 / 0,025). La simulazione si ricrea solo se cambia la firma del grafo o la fascia; posizioni iniziali a cerchio per livello, 300 passi sincroni, poi `sim.stop()`: non riparte mai da sola.
- **Adatta/Centra**: margini X 80 px, Y −45/+55 px; zoom tra 0,2 e 1,6.
- **Trascinamento**: nessuna simulazione durante il gesto. Il nodo va sotto il dito/mouse e le sue foglie esclusive (`foglieEsclusive`: vicini con un solo legame, quello col nodo, mai il centro) lo seguono rigidamente; gli altri nodi restano fermi. Al rilascio restano dove lasciati (fx/fy). Clic sotto soglia apre il dettaglio. Pinch, spostamento vista, pulsanti zoom e Ctrl/⌘+rotella invariati.
- **Riordina**: azzera fx/fy (centro fisso in 0,0), posizioni iniziali, 300 passi sincroni, stop, ridisegno e ricentratura; nessuna animazione.
