# FM65 Parte F – Filtri a cascata nella ricerca articolo (FASE A: analisi + piano)

Base a64afcda. Nessuna modifica fatta. Tutti i dati sotto letti dal codice e dal database reale il 13/11/2026.

## 1) Ricerca articolo nel preventivo oggi
- Componente: `src/components/preventivatore/ArticoloGammaPicker.tsx`, montato solo in `RigheTable.tsx` riga 533 (`<ArticoloGammaPicker soloCodice autoOpen={autoOpenPicker} …`). Popover largo `min(92vw,520px)`, attesa 300 ms, minimo 2 caratteri, query `["articoli-gamma-preventivo", qDeb]`, staleTime 60 s.
- Server: `cercaArticoliPreventivo` (`src/lib/articoli-preventivo.functions.ts`, `requireSupabaseAuth`) chiama `cerca_articoli` con `famiglie: [], sottofamiglie: [], marche: [], fornitori: [], stati: ["in_uso","in_esaurimento"], disponibile_in: [], disponibile_logistica: false, _ordina: "codice", limite: 30`, poi scarta in TS le righe con `origine !== "gamma"`.
- RPC `cerca_articoli(testo, famiglie text[], sottofamiglie text[], marche text[], fornitori uuid[], stati text[], disponibile_in uuid[], disponibile_logistica, listino, _ordina, _direzione, limite, offset)`, SECURITY DEFINER, limite massimo 200. Controllo verbatim: `IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;`
- Testo cercato (ILIKE `%t%`): descrizione, codice, codice articolo fornitore (anche in `articoli_gamma_fornitori`), codice a barre esatto. **La marca non è cercata dal testo**, anche se il segnaposto dice "Codice, descrizione o marca…".
- Il limite 30 vale prima dello scarto TS: righe "solo preventivatore" possono occupare posti e far vedere meno di 30 articoli Gamma.
- Indici su `articoli_gamma`: btree `codice_famiglia`, `codice_sottofamiglia`, `marca_codice`, `codice_a_barre`, `fornitore_pref_id`, pkey `codice`; GIN trigram su `descrizione`, `codice`, `codice_articolo_fornitore`.

## 2) Campi reali su articoli_gamma (attivi = 64.611)
- Famiglia: `codice_famiglia` + `famiglia` — 11 codici distinti, 5 articoli senza.
  FE Ferramenta 22.381 · SR Showroom 16.803 · ED Edilizia 14.422 · CO Colorificio 5.207 · PO Serramenti 3.419 · CA Cartongesso 2.114 · NO Noleggio 156 · SE Servizi 51 · FO Fotovoltaico 48 · (vuoto) 5 · SG Spese generali 4 · `ÙFE` senza nome 1 (codice sporco Gamma).
- Sottofamiglia: `codice_sottofamiglia` + `sottofamiglia` — 110 codici, 173 coppie famiglia+sottofamiglia, 10.258 articoli senza (SR 4.014, FE 2.745, ED 2.431…). Prime 15: SR/PR Pavimenti-rivestimenti ceramici 3.959 · FE/FI Fissaggi 2.907 · SR/RU Rubinetteria 2.294 · FE/CL Calzature 1.983 · FE/CN Consumabili 1.923 · FE/AB Abbigliamento 1.868 · SR/AC Accessori bagno 1.802 · SR/BD Box doccia 1.608 · CO/IN Pitture murali interno 1.349 · FE/AN Antinfortunistica 1.177 · ED/CT Complementi PVC 1.165 · SR/AB Arredo bagno 1.008.
- **34 codici sottofamiglia sono riusati in più famiglie** (es. `AB` = Abbigliamento in FE e Arredo bagno in SR). Il codice da solo non identifica la sottofamiglia.
- Marca: `marca_codice` → tabella `marche` — 1.125 distinte, 6.106 articoli senza, 0 codici orfani. Prime: KAP Kapriol 3.666 · LIN Lineabeta 1.435 · UNF Unifix 1.389 · MWK Milwaukee 1.374 · DIA Diadora 1.339 · FIM Fima 1.288 · MAP Mapei 1.058 · OIK Oikos 991 · AKI Akifix 874 · MEG Megius 832 · STP Stabilplastic 825 · SPI Spi serramenti 761 · VEL Velux 737 · FLAV Flaviker 730. Marche per famiglia: FE 552, ED 477, SR 213, CO 111; per famiglia+sottofamiglia max 180, media 22.
- Linea Sistema MADE / Showroom: **nessuna colonna dedicata** su `articoli_gamma` o `articoli`; "Showroom" esiste solo come famiglia `SR`. Stato: in_uso 62.878, in_esaurimento 1.733.

## 3) Filtri già presenti nel catalogo (riusabili)
- `src/routes/_app/articoli.index.tsx`: tre `FiltroMultiplo` Famiglia / Sottofamiglia / Marca + Fornitore, Stato, "Disponibile in" (con `selezionaTutte`); salvati con `useFiltriPagina`.
- Opzioni da `facetsArticoliGamma` (`src/lib/catalogo-articoli.functions.ts`) → RPC `facets_articoli()`, stesso controllo d'accesso: famiglie, sottofamiglie `(codice, famiglia, descrizione, conteggio)`, marche, tutte calcolate su TUTTO il catalogo attivo.
- Cascata attuale solo parziale: le sottofamiglie sono filtrate per la famiglia scelta in TS; le marche non sono mai filtrate.
- Problemi trovati, che il preventivo erediterebbe:
  a) la funzione `opzioni()` unisce le voci per solo `codice`, quindi `AB` mostra un'unica voce (nome di una famiglia, somma dei conteggi);
  b) `cerca_articoli` filtra `codice_sottofamiglia = ANY(...)` senza la famiglia: scegliendo SR + `AB` vengono fuori solo articoli SR (per via del filtro famiglia), ma scegliendo FE+SR e `AB` escono sia Abbigliamento sia Arredo bagno.

## 4) Proposta
- Una sola logica: un componente condiviso `FiltriCatalogoArticoli` (Famiglia → Sottofamiglia → Marca, tutti `FiltroMultiplo` a scelta multipla, vuoto = tutti, `__none__` = "Senza …") usato sia dal catalogo sia dal picker, con una funzione pura `opzioniCascata` (sottofamiglie solo delle famiglie scelte, chiave `famiglia|sottofamiglia`; marche solo di quelle scelte; scelte non più valide eliminate a valle).
- Opzioni marca a cascata: serve una **nuova funzione SQL** `facets_articoli_cascata(famiglie, sottofamiglie)` (stesso controllo d'accesso, SECURITY DEFINER, STABLE) che restituisce le marche con conteggio per la combinazione scelta. Alternativa senza SQL: scaricare le ~1.600 terne famiglia/sottofamiglia/marca una volta (stima: poche decine di KB) e filtrare in TS — da misurare, preferita se sotto ~50 KB perché nessun viaggio di rete ad ogni scelta.
- Correzione filtro sottofamiglia: `cerca_articoli` riceve coppie `famiglia|sottofamiglia` (nuovo parametro additivo, vecchio comportamento invariato se vuoto). Cambio firma ⇒ ripubblicazione necessaria.
- Prestazioni: conteggi raggruppati su 64.611 righe con indici btree esistenti, ordine dei millisecondi; la ricerca resta su trigram. Facoltativo indice composto `(codice_famiglia, codice_sottofamiglia, marca_codice) WHERE attivo`, da decidere dopo EXPLAIN.
- Picker: con almeno un filtro attivo la ricerca parte anche senza testo (prime 30, ordinate per codice); il testo minimo 2 caratteri resta solo senza filtri. Filtri ricordati per la durata della scheda preventivo (non per riga).
- Telefono: dentro il popover della riga una riga "Filtri (n)" richiudibile sopra il campo di ricerca; le tre tendine a tutta larghezza in colonna, target ≥ 40 px, elenco risultati con scroll interno; su PC tre tendine affiancate. "Seleziona tutte" (`selezionaTutte`) solo dove ha senso (sottofamiglie della famiglia scelta).
- Segnalato, non deciso: segnaposto "…o marca" non veritiero → o aggiungere la marca alla ricerca testo, o cambiare il testo. Il limite 30 va applicato dopo l'esclusione delle righe non Gamma (aggiungere un filtro origine lato SQL invece dello scarto TS).

## 5) Rischi
- Ricerca per codice / codice a barre / solo codice: restano invariate se i filtri sono vuoti (parametri vuoti = comportamento attuale). Test di non regressione dedicato.
- Scelta articolo e prezzo: il picker restituisce sempre `ArticoloGammaScelto {codice, descrizione, marca, um}`; `onChange` e il motore prezzi non vengono toccati.
- Catalogo articoli: filtri salvati vecchi con codici sottofamiglia senza famiglia → convertiti o scartati con `Array.isArray`/validazione (nessun errore, filtro azzerato).
- Popover in riga: `autoOpen`, focus sul campo, `fieldset disabled` per preventivi confermati devono continuare a funzionare; verificare che le tendine dentro il popover non lo chiudano (Popover annidati).
- Firma `cerca_articoli` modificata ⇒ app pubblicata da ripubblicare.

## Fette (3-5 file ciascuna)
1. **F1 – Database**: migrazione additiva `facets_articoli_cascata` (se scelta la via SQL) + parametro coppie su `cerca_articoli` con REVOKE/GRANT; prova reale su `AB` FE/SR e tempi EXPLAIN. File: migrazione, `catalogo-articoli.functions.ts`, `docs/regole/` nota.
2. **F2 – Logica condivisa**: `src/lib/filtri-catalogo-articoli.ts` (opzioniCascata, pulizia scelte, chiave coppia) + test con i casi reali (AB, famiglia vuota, `__none__`).
3. **F3 – Componente condiviso + catalogo**: `FiltriCatalogoArticoli.tsx`, adozione in `articoli.index.tsx` (correzione voci unite), validazione filtri salvati; screenshot 375/1280.
4. **F4 – Picker preventivo**: `ArticoloGammaPicker.tsx` con filtri, `articoli-preventivo.functions.ts` con parametri e limite dopo filtro origine, eventuale segnaposto; screenshot 320/375/1280/1920 in riga.
5. **F5 – Verifica**: test di non regressione ricerca codice/solo codice/prezzo, prova su PRV-161, regola in `docs/regole/`.

## Decisioni da Andrea
- Via SQL (nuova funzione) o elenco terne scaricato una volta?
- Correggere subito nel catalogo le sottofamiglie con codice ripetuto (34 codici)?
- Marca cercabile anche dal testo, o solo da filtro?
- Filtri del picker ricordati per scheda o per utente?
