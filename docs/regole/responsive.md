# Responsive — verifica obbligatoria (decisione di Andrea, 01/11/2026)

- Ogni modifica a una pagina o a un dialog va verificata **a 375px e a 1280px con uno screenshot Playwright PRIMA di dichiararla finita**.
- Se non si può entrare con un utente vero, si renderizza il componente con **dati finti** (es. 3 righe: nome lungo, scaduto + ordini, normale), tramite una pagina temporanea da cancellare subito dopo.
- Nel resoconto si allegano o si descrivono gli screenshot. **Senza questa verifica la fetta non è finita.**
- Sotto 640px: niente scroll orizzontale, nessun testo sotto i 12px, nomi sempre interi (vanno a capo), target touch ≥ 40px (caselle importo ≥ 44px, `inputMode="numeric"`).
- Dialog grandi (es. proposta fido massiva) sotto 640px: a tutto schermo, intestazione fissa in alto, barra azioni fissa in basso, impostazioni chiuse in "▸ Impostazioni e riepilogo"; righe come schede verticali con numeri in griglia 2×2.
- Restano valide le regole della sezione 1 del knowledge (320–1920px) e quella delle tabelle da PC a 1280px (AGENTS.md).
