# FM91 — Tappa 3: kit semplice nel preventivo

21/11/2026. Migrazione additiva `drizzle/migrations/0254_fm91_kit_ruolo_preventivo.sql`: solo ruolo_kit text nullable e commento, nessun dato aggiornato. Colonna verificata applicata; policy di righe/kit/secondo fattore invariate.

## Diagnosi e soluzione

- Il ponte kit-legacy leggeva articolo_id → articoli tecnici, ma i dieci componenti nuovi hanno articolo_codice Gamma. Quindi le righe arrivavano come note con il solo ruolo, senza prezzi/incidenze corrette.
- Picker aggiornato a kit-api/famiglie reali, stessa linea del documento, codice/nome. Gate di consultazione kit e secondo fattore immutati. Linea verificata anche nell'API prima di inserire.
- kit-preventivo prepara righe dal motore unico senza cambiarlo. Gamma inserito come articolo_singolo, manuale come manuale. Riuso campiRigaGammaPreventivo anche nella scelta Gamma ordinaria, senza cambiare il risultato dei campi prezzo. Batch FM71 con sede del riferimento e priorità prezzi cantiere preesistente.
- incidenza integra, quantità arrotondata a due decimali da quantitaDaIncidenza: a 100 mq montanti 338,33, tasselli 143,33, viti 1,69. Cambiando a 200 mq: montanti 676,67. Il ricalcolo legge righe_preventivo.incidenza, non rilegge il kit.
- Peso significa totale riga, non unitario. Importato dal componente (precedenza esplicita) o Gamma; mantenuto durante letture/ricalcoli tramite pesoUnitarioRigaPreventivo. Le righe ordinarie senza ruolo restano sul peso Gamma live.
- IVA: nuova Gamma mantiene aliquota null/default, come il percorso manuale esistente; nessun cambiamento a calcolo-iva. Ruolo solo UI, duplicazione interna inclusa; nessun uso nei PDF/email. Funzione SQL trasforma_preventivo_in_ordine non contiene ruolo_kit (verifica posizione=0), firma invariata.
- Errori elencati nel dialog finale con ordine/descrizione/motivo. Errori di inserimento successivi alla creazione segnalati esplicitamente; nessuna cancellazione automatica.
- Tabella compatta solo per nuovi blocchi kit con ruolo: colonne e azioni tutte visibili a 1280px; tabelle documenti precedenti e altri inserimenti mantengono layout precedente.

## Ritiro verificato

Ricerca import/chiamanti prima della rimozione: kit-legacy solo addBloccoDaKit/AggiungiBloccoDialog; calcolaRigaKit solo vecchio inserimento e test; getCostoNettoCorrente/getPrezzoVendita/calcolaTotaliKit senza chiamanti applicativi esterni. I due ArticoloPicker tecnici non erano renderizzati (RigheTable aveva solo import inutilizzato). Rimossi insieme a ArticoloConListini, RigaCalcolata/TotaliKit storici e costanti FAMIGLIE_KIT/FAMIGLIA_LABEL. FasciaListino resta in articoli-api perché usata altrove. Colonne DB storiche intatte.

## Test e immagini

- Suite completa: **1257 pass, 0 fail**, 154 file, 4198 asserzioni; guardia AST linee/eliminazioni/prezzi inclusa. Otto test dedicati: dieci componenti/100mq, prezzi identici al picker e cantiere, ricalcolo/peso, manuale, errori/dipendenze/Gamma mancante, selezione linea/famiglia, API inserimento/dispatcher/linea negata.
- Compilazione automatica **build OK**, nessun typecheck manuale; diff check pulito.
- Playwright **375 e 1280px**: scelta, inserimento completo, cambio 100→200 mq, avviso divisore zero e viti dipendenti. **Overflow pagina 0, errori runtime 0**; immagini in `docs/verifiche/fm91-kit-preventivo/` esaminate. Tabella a 1280 con tutte le colonne/azioni; schede mobile con codice, ruolo, incidenza, prezzi, peso.
- Prova con stessi componenti/API su pagina temporanea e risposte intercettate: nessuna scrittura reale. Pagina rimossa; script conservato in tests/kit-preventivo.browser.py, da usare con pagina temporanea equivalente. Non è prova autenticata/RLS persistita: `auth-session --self` non trova l'account personale, nessun account altrui usato.

## Dati invariati

Prima/dopo: **1 kit, 10 componenti, 10 preventivi, 12 blocchi, 62 righe**. Zero documenti di prova creati nel DB, zero ruolo_kit popolati sulle righe esistenti.

| Dati | Impronta prima = dopo |
|---|---|
| Kit | f27ce8be5f23aec421ed8119dfe31b4c |
| Componenti | b5b9d0bf372b078edfa3d3f50ec92b9c |
| Preventivi | d41c34facf906116c054a0c7bac11c96 |
| Blocchi | 9b216ae6058d7f150296b7755cb463b5 |
| Righe, escludendo nuova colonna nullable | f83229a09e1c803f411b81b75efa684a |

Il kit reale letto ha Lati=4 alla prima lastra dalla modifica precedente di Andrea: conservato. Fixture del test usa PARETE 1+1 del brief (nessuna modifica ai dati reali).

## File

- Migrazione 0254 e tipi/registro generati dalla piattaforma.
- kit-preventivo.ts, riga-gamma-preventivo.ts, preventivi-api.ts, riga-preventivo.ts, kit-api.ts, incidenza.ts.
- AggiungiBloccoDialog.tsx, RigheTable.tsx; rimossi kit-legacy e due ArticoloPicker inutilizzati.
- Test dedicati, test compatibilità aggiornato, foto/script, regole kit, AGENTS d'area e roadmap.

Da pubblicare per attivare il nuovo percorso; schema già applicato, nessuna firma SQL cambiata.