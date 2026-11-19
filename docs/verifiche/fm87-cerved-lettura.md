# FM87 — Scheda Cerved e lettura del report

## Dato reale e diagnosi

G-E TRADE SRL, cliente `313c727e-8ec5-4114-87fb-d7142acc0d32`, richiesta `4839828910`, report del 19/11/2026.

- XML grezzo conservato nel registro `cerved_chiamate.risposta.contenuto_xml`, collegato alla fotografia tramite `chiamata_id`: disponibili tutti i 60 XML, senza recuperi Cerved.
- PDF presente nel bucket cerved-report. Non scaricato in questa verifica: confronto con i valori PDF indicati da Andrea e riscontro diretto dell'XML archiviato.
- Il vecchio campo mol leggeva Ebitda: ora GrossProfit → MOL e Ebitda → EBITDA, distinti. Valori G-E TRADE 2025/2024/2023: MOL 751/254/161 mila €, EBITDA 745/359/165 mila €.
- Valutazioni verificate: C4_1 Assenti, C5_3 Forti segnali di rischio, C6_1 Assenza di segnali di rischio. Payline assente: voce Tempi di pagamento non mostrata.
- FlagPc/FlagPP e CgrFlags non interpretati come eventi: persone senza booleani negativi true → Nessuno segnalato. Collegati deduplicati per CF+nome: cinque voci; FILIPPI CORRADO compare una volta, EDIL VENETA rimane un nome distinto.
- Omonimia solo nota informativa neutra, non un protesto; nessun semaforo nella CardScore con LR.

## Campi XML trovati

Tutti i campi richiesti al punto 7 sono presenti nel vero XML G-E TRADE e negli XML delle 47 fotografie con bilancio; 13 fotografie non contengono bilanci, non sono state modificate.

| Campo | Percorso sotto LightReport | G-E TRADE 2025 |
|---|---|---:|
| MOL | BalanceSheetCebi/BalanceSheetInfo/ProfitAndLoss/GrossProfit/Value | 751.000 € |
| EBITDA | BalanceSheetCebi/BalanceSheetInfo/ProfitAndLoss/Ebitda/Value | 745.000 € |
| Banche a breve | BalanceSheetCebi/BalanceSheetInfo/LiabilitiesAndShareholderEquity/STDebtsTowardsBanks/Value | 484.000 € |
| Banche medio-lungo | BalanceSheetCebi/BalanceSheetInfo/LiabilitiesAndShareholderEquity/MiddleLongTermDebtsTowardsBanks/Value | 1.023.000 € |
| Passivo a breve | BalanceSheetCebi/BalanceSheetInfo/LiabilitiesAndShareholderEquity/ShortTermLiabilities/Value | 1.379.000 € |
| Immobilizzazioni materiali | BalanceSheetCebi/BalanceSheetInfo/Assets/TangibleAssets/Value | 1.795.000 € |
| Cash flow | BalanceSheetCebi/BalanceSheetInfo/ProfitAndLoss/CashFlow/Value | 464.000 € |
| EBIT | BalanceSheetCebi/BalanceSheetInfo/ProfitAndLoss/OperatingProfit/Value | 593.000 € |
| Current ratio | CompanyDevelopmentIndicators/BalanceSheetRatios/Voices/CurrentAssetsRatio/Value | 137,1 |
| Indebitamento | CompanyDevelopmentIndicators/BalanceSheetRatios/Voices/DebtRatio/Value | 2,200345 |

Importi XML in migliaia convertiti in euro, indici conservati senza moltiplicazione; indici abbinati per data di chiusura. Campi mancanti richiesti: nessuno sul caso G-E TRADE. Se un campo manca in altri XML, resta null.

## Riallineamento dati

Aggiornate soltanto le chiavi MOL/EBITDA e i nuovi campi dei bilanci, da XML già archiviato. 47 fotografie aggiornate, 135 annate. Tutti i bilanci riletti dal DB sono identici al risultato di normalizzaLightReportXml; tutte le altre chiavi delle 60 fotografie sono invariate. Nessuna migrazione, nessuna modifica di RPC, fidi, permessi o acquisti.

## Lettura G-E TRADE

- Forza: fatturato 2,96 → 4,94 → 7,83 mln (+58,6%), utile 309 mila (+143,3%) con ROE 30,8%, patrimonio 1,16 mln (+36,4%), eventi assenti, CEBI S4.
- Attenzione: banche a breve 88 → 484 mila (+450%), liquidità 199 mila / passivo breve 1,379 mln (14,4%), consultazioni C5_3 con 63 totali e 7 richieste imprese nei due mesi finali, un addetto con 7,83 mln, fido MADE 145.000 / certificato 20.500, esposizione 88.061,67 oltre certificato, score 36.
- In più il current ratio reale scende da 233,5 a 137,1 (-41,3%): attiva la regola richiesta del calo oltre 30%.
- Esposizione: `clienti.totale_rischio`, già mostrato nella scheda cliente; verificato uguale alla pubblicata esposizione_corrente (88.061,67). Nessun ricalcolo.
- Soglie raccolte in SOGLIE_LETTURA_CERVED; lettura solo informativa a regole fisse, senza AI.

## Verifiche e limiti

- bun test: **1093 superati, 0 falliti**, 143 file; test nuovi per decodifiche, campi XML, caso reale, soglie e valori limite.
- Compilazione automatica OK.
- Playwright: VistaCerved reale con dati G-E TRADE letti dal DB/XML, su pagina temporanea poi rimossa. Fotografie per score, lettura, consultazioni, bilancio ed eventi a 375/768/1280/1920. Overflow orizzontale 0 alle quattro dimensioni, nessun errore JavaScript e nessuna chiamata Cerved. Totali 63, banche 38, imprese 10, altri 15; totali mensili sopra le colonne.
- Fotografie controllate visivamente; soggetti collegati leggibili senza la precedente casella stretta, FILIPPI CORRADO esatto una sola volta.
- La sessione personale non è disponibile: apertura della scheda autenticata e PDF nell'app **non verificati**. Non utilizzato un altro account arbitrario. Nessuna chiamata, acquisto o recupero a Cerved eseguito durante tutto il lavoro.

## File

- src/components/cliente-cerved-tab.tsx
- src/routes/_app/clienti.$clienteId.tsx (solo passaggio dell'esposizione già esistente)
- src/lib/cerved-presentazione.ts
- src/lib/cerved-lettura.ts
- src/lib/cerved/cerved.server.ts (solo normalizzatore/tipo bilanci)
- src/lib/cerved/AGENTS.md
- src/lib/AGENTS.md
- tests/cerved-lettura.test.ts
- tests/cerved-normalizzazione.test.ts
- tests/cerved-presentazione.test.ts
- tests/fixtures/cerved-light-report-ge-trade.xml
- roadmap.md e questo rapporto

Nuova fonte unica e decodifiche documentate nei file AGENTS; eventuale aggiornamento delle regole di area in docs/regole resta al proprietario. Da ripubblicare per rendere disponibili le modifiche della scheda.