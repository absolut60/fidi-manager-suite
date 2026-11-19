# FM89 — Scheda Cerved a tutta pagina

Solo impaginazione. Nessun cambio a dati, regole, normalizzazione, permessi; nessuna chiamata a Cerved.

## Dove vale
- Nuova griglia solo nella tab Cerved della scheda cliente (`ClienteCervedTab pagina` in `clienti.$clienteId.tsx`).
- La finestra "Apri scheda Cerved" delle sezioni compatte (richiesta fido, proposta massiva, approvazione) usa `ClienteCervedTab` senza `pagina`: impaginazione precedente invariata (max-w-6xl).

## Disposizione (pagina)
- ≥1280: testata compatta (4 colonne, Aggiorna + PDF sulla riga del nome); Score 3 · Valutazioni 3 · Lettura 6 (stessa altezza); Rischio consultazioni a tutta riga 4/8 con grafico alto h-40 (era h-20), totale grande, totali per categoria col colore, ultimi `SOGLIE_LETTURA_CERVED.mesiRichieste` mesi evidenziati; Payline · Immobili · Eventi straordinari su 3; bilanci con tre anni affiancati (più recente a sinistra) e voci secondarie sotto ciascun anno (in pagina la sottosezione "Debiti e crediti" di Altri dati è omessa per non duplicarle); Elementi principali su 4; società collegate su 3 dentro il blocco unico; Altri dati.
- 768–1279: due colonne (Score + Valutazioni, Lettura sotto, Payline/Immobili/Eventi su 2, società su 2); consultazioni con giudizio sopra e grafico sotto.
- <768: impilato; il grafico scorre in orizzontale dentro il riquadro (min 36rem), etichette mesi su una riga.
- Codice consultazioni non decodificato (non C5_*): solo totale + grafico.

## Verifiche
- Screenshot con i dati reali G-E TRADE (fotografia light_report archiviata, pagina temporanea poi rimossa) a 375, 768, 1280, 1700, 1920: overflow orizzontale della pagina 0 a tutte le larghezze.
- Tab reale autenticata non fotografata: sessione di prova non disponibile.
- Test esistenti verdi (`bun test`).
