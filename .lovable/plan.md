# Rifinitura pagina Utenti

## Intervento
- Rendere distinti i valori iniziali dei filtri e uniformare altezza/allineamento dei controlli.
- Compattare la tabella desktop, assegnando larghezze coerenti a nome, ruoli, punto vendita, stato e azioni.
- Mostrare l’email sotto il nome tra `md` e `xl`, mantenendo la colonna email dedicata da `xl` in su.
- Mantenere le schede sotto `md` e la tabella da `md` in su, coerentemente con il kit esistente.

## Verifica
- Controllo dei tipi.
- Controllo reale a 375, 768, 1024, 1280 e 1600 px per assenza di sovrapposizioni e scorrimento orizzontale della pagina.

## Dettagli tecnici
- Modifiche limitate alle classi Tailwind e ai testi delle opzioni in `src/routes/_app/utenti.tsx`.
- Nessuna modifica a filtri, ordinamento, dialog, ruoli, funzioni server o database.
