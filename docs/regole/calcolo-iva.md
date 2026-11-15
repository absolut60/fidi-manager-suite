# Calcolo IVA del preventivo (FM74/FM75)

Fonte unica TypeScript: `riepilogoIva` in `src/lib/calcolo-iva.ts`.
Gemello SQL documentato: `public.calcola_riepilogo_iva(p_preventivo_id)` (migrazione 0234). Ogni modifica va fatta in entrambi, con i test (`tests/calcolo-iva.test.ts`, `tests/sql/fm75-riepilogo-iva.sql`).

Stato (F3d): **fonte dei totali persistiti** (`preventivi.totale_imponibile`, `iva_importo`, `totale`).

- TypeScript: l'unico punto che produce i totali è `totaliDocumento` (`calcolo-iva.ts`, basato su `riepilogoIva`), usato da `ricalcolaTotaliPreventivo` (salvataggio righe, aggiornamento listini, ricalcolo blocco) e da `calcolaTotaliPreventivo` (totali a schermo salvati dalla pagina, PDF). La duplicazione copia i totali della sorgente.
- SQL: `trasforma_preventivo_in_ordine` calcola i totali dell'ordine con `calcola_riepilogo_iva` (migrazione 0235).
- Non regressione: in `ordinaria` senza override di riga c'è un solo gruppo ad aliquota `iva_perc`, quindi il risultato coincide con il vecchio conto imponibile × `iva_perc` (provato in `tests/calcolo-iva.test.ts` e `tests/sql/fm75-totali-ordine-iva.sql`). I documenti esistenti non sono stati ricalcolati.

## Regimi (`preventivi.regime_iva`)

- **ordinaria**: ogni riga usa `aliquota_iva` se c'è, altrimenti l'aliquota di testata (`iva_perc`, 22 se manca). Il riepilogo raggruppa per aliquota.
- **agevolata_10**: tutto il documento al 10%. Non ci sono flag né eccezioni: l'aliquota di riga viene ignorata.
- **agevolata_10_bs**: calcolo di concorrenza. T = totale dell'intervento, B = totale delle righe `bene_significativo`. La quota al 22% è `max(0, 2B − T)`, il resto (T − quota22) va al 10%. Le aliquote di riga non contano: decide il calcolo. Nel risultato c'è anche il dettaglio (T, B, quota22), che servirà agli avvisi.

## Arrotondamenti

Si conta in centesimi interi. L'IVA si calcola per ogni aliquota: imponibile × aliquota / 100, arrotondata ai centesimi con la metà che va lontano da zero (come ROUND di PostgreSQL). Le aliquote con imponibile 0 non compaiono. Totale = imponibile + IVA.

## Esempio di riferimento

Righe: posa 2.000, piastrelle 1.500, colla 300, sanitari 2.500 (BS), rubinetteria 1.700 (BS).
T = 8.000, B = 4.200, quota al 22% = 8.400 − 8.000 = 400.

- Regime agevolata_10_bs: 7.600 al 10% (IVA 760) e 400 al 22% (IVA 88). IVA 848, totale **8.848**.
- Stesso preventivo in agevolata_10: 8.000 al 10%, totale **8.800**.
- Se B ≤ T/2 oppure non ci sono beni significativi: tutto al 10%.
