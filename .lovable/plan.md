# Scheda cliente incorporata
- Validare `vista` una sola volta nel layout condiviso; solo il valore `incorporata` elimina la cornice dell’app, dopo gli stessi controlli di accesso/MFA.
- Usare il parametro nella finestra cliente e nascondere Indietro solo nella scheda incorporata.
- Preservare la ricerca al cambio tab; i collegamenti ad altre pagine, anche nelle sezioni figlie, aprono una nuova scheda senza portare con sé la vista incorporata.
- Nessun cambiamento a database o permessi; modalità normale invariata.

## Verifiche
Test Bun per il parametro e la destinazione dei link; confronto dei controlli di accesso; schermate della finestra a 375/1280px, cambio tab e confronto dell’apertura normale. Sessione reale disponibile: verificare con letture reali, senza scrivere dati.