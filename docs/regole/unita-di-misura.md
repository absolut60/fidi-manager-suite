# Unità di misura Gamma (FM63 Fetta 4)

Regola canonica, verificata con Andrea sui dati reali.

- In Gamma giacenza, ordini clienti, ordini fornitori, disponibilità e **tutti** i prezzi/costi sono nell'unità **primaria**: `articoli_gamma.um` (UM1).
- `articoli_gamma.fattore_conversione` = quante UM1 stanno in 1 unità **secondaria** (`articoli_gamma.um2`): **1 UM2 = fattore × UM1**.
- Quantità in UM2 = quantità UM1 **÷** fattore.
- Prezzo/costo per UM2 = prezzo UM1 **×** fattore.
- Percentuali (sconti, trasporto %) invariate.
- **"quantità UM2 = UM1 × fattore" è SBAGLIATO.**

## Esempi
| Articolo | UM1/UM2 | Fattore | Quantità | Prezzo |
|---|---|---|---|---|
| FASL00H003300A0 | MQ/NR | 3,6 | 5.223,6 MQ = 1.451 NR | 4,1670 €/MQ = 15,0012 €/NR |
| sacco da 25 kg | KG/NR | 25 | 100 KG = 4 NR | × 25 |
| rotolo | MQ/RT | 50 | 100 MQ = 2 RT | × 50 |
| pallet | NR/PAL | 75 | 150 NR = 2 PAL | × 75 |
| confezione | CO/PZ | 0,01 | 100 CO = 10.000 PZ | × 0,01 |

## Convertibile
Solo se UM2 non vuota, UM2 ≠ UM1, fattore > 0 e fattore ≠ 1. Con UM2 diversa ma fattore 0 o 1 il dato Gamma non è affidabile: niente conversione, nota "Fattore di conversione non valido in Gamma".

## Fonte unica
`unitaArticolo()` e `inUnita()` in `src/lib/scheda-articolo.ts`: nessun altro punto del codice converte. Quantità convertite al massimo 3 decimali, prezzi sempre 4 decimali. Ogni quantità mostra l'unità, ogni prezzo "€/UM".

## Preventivi e ordini (FM65 R1a, decisione Andrea valida anche per R2)
Quantità e prezzi di riga sono SEMPRE salvati in UM1. `um_scelta` (`um1`/`um2`, default `um1`) è soltanto la scelta di visualizzazione, inserimento e stampa. In UM2: quantità mostrata = UM1 ÷ fattore, prezzo mostrato = UM1 × fattore; importo invariato. La trasformazione in ordine e la duplicazione copiano quantità/prezzi UM1 e `um_scelta`, senza conversione. R1a prepara e copia il campo; editor e PDF UM2 arrivano in R2.
