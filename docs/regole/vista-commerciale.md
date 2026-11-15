# Vista commerciale del preventivo (FM74/FM75)

Fonte unica: `src/lib/vista-commerciale.ts` (`vistaCommerciale`). Sarà usata da PDF, anteprima e ordine verso Gamma (F2c/F6); nessun altro punto ricalcola cosa si stampa.

## Flag e raccoglitore
- Ogni riga ha `righe_preventivo.stampabile` (default true).
- Raccoglitore = la **prima** riga del preventivo (ordine blocchi, poi righe) per cui `isRaccoglitorePosa(articolo_codice)` è vero (`src/lib/riga-preventivo.ts`, `/^PEF/i`: fonte unica). Altre righe PEF* sono righe normali.
- **Senza raccoglitore** il flag è ignorato: si stampa tutto.
- **Con raccoglitore**: le righe stampabili si espongono col proprio importo; le nascoste spariscono dalla vista e il loro importo (somma algebrica, negativi compresi) si aggiunge all'importo stampato del raccoglitore.
- Righe non valorizzate (commenti/descrittive) passano invariate se stampabili.
- Subtotale stampato del blocco = somma degli importi stampati delle sue righe visibili; un blocco senza righe visibili ha `vuoto: true` e può essere omesso.

## Invariante
Totale stampato = totale vero (somma degli importi delle righe), al centesimo: il calcolo avviene in centesimi interi.

## Evoluzione (F3)
L'output espone `raccoglitori: GruppoRaccoglitore[]` (gruppo "nascoste → raccoglitore", chiave). Oggi c'è al massimo un gruppo (`posa`); con F3 (beni significativi) ci saranno più raccoglitori per natura fiscale, ognuno con le proprie nascoste, senza cambiare la forma dell'output.
