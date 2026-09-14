# Informativa privacy ufficiale e PDF su una pagina

## Intervento

1. Aggiornare la versione dell’informativa e sostituire integralmente il testo ufficiale, lasciando invariati consensi, etichette e calcolo hash.
2. Aggiornare solo l’impaginazione della pagina 1 della scheda PDF: nuovi margini, due colonne, testo 6,5 pt, interlinea 1,17 e spaziatura 1,3.
3. Riportare nelle due colonne le stesse frasi dell’informativa ufficiale, con la suddivisione e le indentazioni indicate.
4. Lasciare invariati contenuti e impaginazione della pagina 2; il cambio dei margini richiesto si applicherà alle coordinate condivise di intestazione, tabella e piè di pagina.

## Verifica

- Generare un PDF di prova di due pagine.
- Controllare visivamente entrambe le pagine, verificando che l’informativa resti interamente nella sola pagina 1 e che la pagina 2 non abbia regressioni.
- Confrontare programmaticamente il testo ufficiale con la concatenazione dei contenuti della pagina 1 per evitare omissioni o riscritture.

## File modificati

- `src/lib/consensi-testi.ts`
- `src/lib/scheda-pdf.ts`
