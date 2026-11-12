# Responsive: ogni larghezza, non solo il telefono

Regola permanente del proprietario. Si aggiunge alla sezione 1 del knowledge.

- Responsive vale da 320px a 1920px. Su PC la pagina non deve allargarsi con riquadri enormi, testo sovradimensionato e spazio vuoto.
- Contenitore con larghezza massima (`max-w-6xl`/`max-w-7xl`), mai colonne uniche larghe con metà schermo vuota.
- Pagine di dettaglio da `xl` (≥1280px): due colonne, principale ~2/3 e laterale ~1/3 (stato, azioni, cronologia) `sticky` con scroll proprio. Sotto `xl` una colonna con stato e azioni in alto.
- Card compatte: spaziatura tra card `gap-3`/`space-y-3`, padding `p-3` mobile e `p-4` desktop; riquadri dati `p-2.5`, etichetta `text-[11px]`, valore `text-base` (solo i dati principali `text-lg`).
- Righe etichetta/valore in griglia a 2 colonne (`grid-cols-[7rem_minmax(0,1fr)]`), non impilate.
- Verificare sempre a 390, 768, 1280 e 1920px: nessuno scroll orizzontale, nessuna colonna stretta illeggibile.

## Verifica obbligatoria (decisione di Andrea, 01/11/2026)

- Ogni modifica a una pagina o a un dialog va verificata **a 375px e a 1280px con uno screenshot Playwright PRIMA di dichiararla finita**.
- Se non si può entrare con un utente vero, si renderizza il componente con **dati finti** (es. 3 righe: nome lungo, scaduto + ordini, normale), tramite una pagina temporanea da cancellare subito dopo.
- Nel resoconto si allegano o si descrivono gli screenshot. **Senza questa verifica la fetta non è finita.**
- Sotto 640px: niente scroll orizzontale, nessun testo sotto i 12px, nomi sempre interi (vanno a capo), target touch ≥ 40px (caselle importo ≥ 44px, `inputMode="numeric"`).
- Dialog grandi (es. proposta fido massiva) sotto 640px: a tutto schermo, intestazione fissa in alto, barra azioni fissa in basso, impostazioni chiuse in "▸ Impostazioni e riepilogo"; righe come schede verticali con numeri in griglia 2×2.
- Restano valide le regole della sezione 1 del knowledge (320–1920px) e quella delle tabelle da PC a 1280px (AGENTS.md).

## Larghezza delle pagine e prezzi (FM63)

- Ogni pagina usa tutta la larghezza disponibile come la scheda cliente (niente max-w fissi sulle schede) e si restringe in modo progressivo da 360 px a 1920 px; nessuna pagina con riquadri stirati o spazio sprecato su monitor larghi.
- Prezzi unitari in euro sempre a 4 decimali.
