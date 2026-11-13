# Prezzi del preventivo (FM65)

## Regola delle regole
- Il prezzo di vendita nel preventivo segue il **cliente**, non la sede di chi fa il preventivo:
  listino Gamma scritto per il cliente (`clienti_condizioni_gamma.listino`) e prezzi per deposito
  della **sede del cliente** (`clienti.store_id`).
- Il TypeScript **non ricalcola prezzi**: usa sempre `public.prezzi_preventivo_cliente(_cliente_id, _codici, _data)`.
- Il calcolo sta in `public._prezzo_preventivo_articoli` (solo service_role). Il prezzo da listino/deposito
  viene sempre da `public._prezzo_vendita_articoli` (fonte unica, non duplicata).
- `prezzi_preventivo_cliente` è SECURITY DEFINER perché l'RLS (FM64) limita i listini alla sede
  dell'utente; gate `auth_ha_accesso_preventivi()` (altrimenti 42501), massimo 500 codici.

## Catena Gamma (LI01, livelli attivi, in quest'ordine)
Vettore di 6 sconti (slot 1..6, partono a 0) e maggiorazione Magg1 (parte a 0).
1. **Articolo (10)**: prezzo = `articoli_gamma_listini.prezzo_vendita` del listino del cliente; nessuno sconto.
2. **Categoria cliente (20)**, `sconti_categoria_gamma` valida alla data, listino NULL o uguale:
   prima macro+categoria+sottocategoria esatte, se manca la riga con sottocategoria vuota (regola generale).
   Il prezzo non cambia; sc1, sc2, sc4 ≠ 0 nei primi slot liberi; mag1+mag2 si sommano a Magg1.
3. **Cliente/famiglia (50)**, `sconti_cliente_famiglia_gamma`: famiglia (e sottofamiglia se valorizzata),
   preferita la riga con sottofamiglia. sc1..sc6 **sostituiscono** gli slot 1..6 (anche a 0).
   Righe con vero intervallo da_*≠a_* ignorate, avviso `intervallo_famiglia_non_gestito`.
4. **Articolo/deposito (55)**: se c'è prezzo per deposito della sede del cliente, il prezzo è sostituito
   e gli slot 1..5 azzerati; la maggiorazione resta.
5. **Listino più articoli (60)**, `listino_piu_articoli_gamma` con `listino_piu_articoli` del cliente:
   prezzo ≠ 0 sostituisce il prezzo; slot 1 = sc1 della riga, slot 2..5 = 0; maggiorazioni invariate.
6. **Cliente/articolo (90)**, `prezzi_cliente_articolo_gamma`: prezzo ≠ 0 sostituisce il prezzo;
   sc1..sc6 sostituiscono gli slot 1..6; mag1 si somma a Magg1.

Nei livelli 5 e 6 gli slot vengono sostituiti quando la riga esiste, anche con prezzo 0 (27 righe
cliente/articolo hanno prezzo 0: in quel caso resta il prezzo precedente).

Prezzo netto = prezzo × Π(1 − slot/100) × (1 + Magg1/100), arrotondato a 4 decimali.
Sconti dell'anagrafica (`sc1_cliente`, `sc2_cliente`, `sc3_cliente`, `sconto_piede`): Gamma non li applica, ignorati.
Sconto/maggiorazione a importo ≠ 0: non applicati, avviso `importo_non_gestito`.
Altri avvisi: `articolo_senza_prezzo_su_listino`, `cliente_senza_listino`, `cliente_senza_sede`.

## Casi verificati in Gamma (DDT 11-13/11/2026), prova in `tests/sql/fm65-motore-prezzi.sql`
| Cliente | Articolo | Netto | Perché |
|---|---|---|---|
| DELEO 5003 | ITA1000108 | 4,8000 | deposito CA, niente categoria |
| A.N. COSTRUZIONI 13380 | FASL00H003300A0 / KAP28861 | 3,7503 / 23,7000 | −10% categoria / più articoli netto |
| EDILCIDA 13142 | FASL00H003300A0 / ITA1000108 | 3,4586 / 5,0085 | famiglia −17% sostituisce −10% / Cinisello senza deposito |
| INTECH 13427 | FASL00H003300A0 | 3,4700 | cliente/articolo azzera sconti |
| MORENO COMELLO 13573 | FASL / ITA1000108 / KAP28861 | 5,3245 / 5,6350 / 27,2550 | Magg1 15% sopravvive a deposito e più articoli |
| EDILSPI 3173 | FASL / ITA1000108 | 4,1670 / 5,5000 | sottocategoria LA1 senza regola → 01/01 generale; deposito EA |
| COMUNE DI SEDRIANO 2249 | FASL / ITA1000108 | 4,6300 / 5,6000 | categoria 03 senza regola, sconto anagrafica ignorato; deposito 00 |

## Riga del preventivo (FM65 fetta 2a)
- **Il calcolo della riga vive solo in `src/lib/riga-preventivo.ts`** (`prezzoNettoRiga`, `importoRiga`, `marginePercRiga`); nessun altro file copia la formula.
- Colonne riga: `articolo_codice` (codice Gamma), `sconti_gamma` (fino a 6 sconti in cascata, nell'ordine), `maggiorazione_perc`; `sconto_perc` è lo **sconto extra** (piede o trattativa), in cascata DOPO gli sconti Gamma.
- Netto = prezzo_unit × Π(1 − s/100 per s in sconti_gamma) × (1 + maggiorazione_perc/100) × (1 − sconto_perc/100). Il netto **non** si arrotonda (si mostra a 4 decimali).
- Importo = arrotonda2(quantità × netto × segno). **Arrotondamento chiuso:** Gamma arrotonda solo l'importo di riga a 2 decimali, metà per eccesso (A.N. COSTRUZIONI: 25,2 MQ × 3,7503 = 94,5076 → 94,51; 23,70 × 1,15 = 27,255 → 27,26). Il "Prezzo netto unitario" di Gamma è importo/quantità.
- Lo sconto a piede scrive `sconto_perc` sulle righe articolo/kit/manuale e ricalcola l'importo sopra gli sconti Gamma della riga.
- `importo` è salvato con il segno: i totali di blocco sono SUM(importo), mai importo × segno.

## Punti aperti
- Preventivi ai lead: la funzione interna accetta `_cliente_codice` NULL (livelli 3 e 6 saltati);
  manca la funzione pubblica e la scelta di listino/sede per il lead.

## Testata e riga articolo (FM65 fetta 2b-1)
- Nel preventivo non si sceglie più la fascia A/B/C/SOCI: la testata mostra in sola lettura "Listino" e "Categoria" del cliente da `public.condizioni_preventivo_cliente` (gate `auth_ha_accesso_preventivi`). La colonna `fascia_listino` resta solo per kit e "Aggiorna listini" fino alla fetta 2b-2.
- "Aggiungi riga" cerca nel catalogo Gamma (`cerca_articoli`, solo articoli in uso/in esaurimento, 30 risultati) senza mostrare il prezzo della lista (è della sede dell'utente). Alla scelta il prezzo arriva solo da `prezzi_preventivo_cliente`: prezzo lordo = `prezzo_base`, sconti = slot diversi da 0 nell'ordine, maggiorazione, sconto extra = sconto a piede se presente, costo = costo ultimo × quantità. Fonte, regole e avvisi del motore non si mostrano.
- Senza cliente o senza prezzo dal motore la riga si salva senza prezzo con l'avviso "Prezzo non disponibile: inseriscilo a mano".
- Prezzo, sconti ("17+5", massimo 6), maggiorazione, sconto extra e costo unitario restano modificabili; ogni modifica salva l'importo con `patchConImporto`/`importoRiga`.
- Le righe del vecchio catalogo (`articolo_id`) restano modificabili con il vecchio selettore.


## Kit e "Aggiorna listini" (FM65 fetta 2b-2)

- La fascia A/B/C/SOCI non si sceglie più né nella creazione né nel preventivo: listino e categoria vengono dal cliente (`condizioni_preventivo_cliente`).
- Blocco da kit: UNA chiamata a `prezzi_preventivo_cliente` per tutti i codici dei componenti; senza cliente il kit non si aggiunge ("Scegli prima il cliente"). Componenti senza codice Gamma o senza prezzo: riga rossa "Articolo non collegato a Gamma: inserisci prezzo e costo a mano".
- "Aggiorna listini": UNA chiamata al motore per le righe articolo/kit con codice; mostra solo le righe diverse, aggiorna solo quelle spuntate e non tocca lo sconto extra. Righe manuali, note e separatori non si toccano.
- Costo di riga = costo unitario × quantità a 4 decimali (`costoRiga`), anche quando il costo unitario si modifica a mano.

## Correzioni FM65 fetta 2b-3
- Margine del blocco e del preventivo: stessa funzione `margineTotaliRighe`, (somma importi netti − somma costi) / somma importi netti × 100; solo righe articolo/kit/manuali, nessun uso della vecchia colonna `vendita`.
- Le intestazioni kit si riconoscono dall'assenza di entrambi i collegamenti (`articolo_id` e `articolo_codice`); nel kit reale le due STRATI hanno `kit_componenti.articolo_id IS NULL`. Nuovi gruppi salvati come note; quelli esistenti presentati come testo ed esclusi dai calcoli, senza modificare dati storici. Un articolo tecnico senza codice o prezzo mantiene l'avviso rosso.
- Peso delle righe con codice Gamma: `articoli_gamma.peso_netto × quantita` in UM1, lettura batch con RLS. Dato assente mostrato come «—», senza fallback al catalogo tecnico, senza influenza sul prezzo.

## Incidenza e quantità del blocco (FM65 fetta 3a)
- Righe valorizzate articolo/kit/manuali: quantità = incidenza × Qb (2 decimali); quando si cambia la quantità, incidenza = quantità / Qb (4 decimali), anche se prima assente. Note, separatori, sotto-totali e intestazioni kit non partecipano.
- Fonte unica `quantitaDaIncidenza` / `incidenzaDaQuantita` / `patchConImporto` in `riga-preventivo.ts`; salvataggio riga, cambio Qb e aggiunta kit le riusano. Con Qb nullo o zero le funzioni restituiscono null: nessun ricalcolo incrociato. Togliere l'incidenza non azzera la quantità.
- Il costo segue la quantità mantenendo il costo unitario a 4 decimali; il peso segue la quantità (Gamma quando disponibile). Importo e totali blocco/preventivo sono aggiornati dopo il salvataggio.
- Formati delle schermate: `formatNumeroIt` (`numero-it.ts`), stessa resa italiana del piede: quantità/importi a 2 decimali, incidenze/prezzi unitari a 4, virgola decimale e migliaia con punto.

## Creazione e alternative (FM65 ridisegno R1a)
- `titolo` e `condizione_pagamento_cod` facoltativi; `creato_da` default `auth.uid()` soltanto per nuovi documenti, invariabile negli UPDATE. Nessun backfill sugli esistenti.
- `alternativa_di` riferisce un principale dello stesso cliente, tipo preventivo, mai sé stesso né un’altra alternativa; il trigger protegge anche i cambi del principale che invaliderebbero i figli. Gli ordini e i duplicati non ereditano il legame.
- Scelta: RPC di sola lettura `lettera_preventivo(_id uuid)` (STABLE SECURITY DEFINER, gate `auth_vede_preventivo_id`), non vista/colonna salvata. Principale A, alternative B/C… per `created_at,id` (id risolve i pari merito), dopo Z AA/AB. Gemella TS `letteraPreventivo` in `preventivo-creazione.ts`, richiede l’elenco completo dei fratelli, senza filtrarli per la visibilità individuale.
- `cerca_clienti_preventivo(_q text)` e `dati_cliente_preventivo(_id uuid)`: STABLE SECURITY DEFINER, search_path public, EXECUTE authenticated/service_role. Gate consultazione preventivi (richiedente puro 42501); dopo il gate, identico predicato per cliente delle RPC lite, mai dati credito. RPC lite lasciate invariate. Ricerca codice esatto/prima parte, nome/P.IVA, massimo 50, codice esatto primo. Query SQL statica parametrizzata: `%`, `_` e backslash escaped come LIKE letterale; non costruisce un `.or()` PostgREST, quindi niente sostituzione dei caratteri di punteggiatura dei nomi.
- Creazione: titolo facoltativo consigliato, validità data +7 giorni di calendario; riallineata al cambio data finché non modificata a mano (`riallineaValidita`). Pagamento proposto da dati cliente, elenco modificabile dal catalogo DB (in questa finestra codice – descrizione, come richiesto da Andrea). Cantiere provvisorio vuoto salvato «Da definire».
- Ordine: copia titolo, pagamento e unità scelta; quantità/prezzi già UM1, nessuna conversione. Duplicazione copia gli stessi nuovi campi, autore dal default e alternativa null. Interfaccia a tab esclusa da R1a.
