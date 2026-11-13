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

## Punti aperti
- Arrotondamento finale di Gamma (oggi solo 4 decimali) in verifica.
- Preventivi ai lead: la funzione interna accetta `_cliente_codice` NULL (livelli 3 e 6 saltati);
  manca la funzione pubblica e la scelta di listino/sede per il lead.
