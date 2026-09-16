# Diagnosi: partecipanti creati ma non visibili dopo la riconciliazione import

## Cosa dicono i dati

Ultimo import (evento 75ef3412-…), righe di staging:

| riga | soggetto | match | stato |
|---|---|---|---|
| 2 | Sergio Evento / MADEDISTRIBUZIONE | cliente fb0f205c… | collegato (06:29:51) |
| 3 | Claudio Evento | cliente 8840e2b7… | collegato (06:29:52) |

Partecipanti dello stesso evento:

| id | cliente_id | contatto_id | stato | created_at |
|---|---|---|---|---|
| 6ea5bea2… | fb0f205c… | 4d5a4c34… | atteso | 06:30:03 |
| a9487dff… | 8840e2b7… | — | atteso | 06:30:03 |

Quindi **i partecipanti vengono creati davvero**. La RPC `collega_righe_import` inserisce in `eventi_partecipanti` (evento_id, stato 'atteso', cliente_id/lead_id, contatto_id, note) e solo dopo marca la riga come `collegato`. Anche `crea_lead_da_righe_import` crea il partecipante tramite `crea_partecipante_da_nuovo_soggetto`.

## Causa reale del sintomo

Il problema è di aggiornamento della schermata, non di dati. In `riconcilia-import-card.tsx`, dopo l'azione si invalidano le chiavi:

- `["evento-import-righe", eventoId]`
- `["evento", eventoId]`
- `["eventi-partecipanti", eventoId]`
- `["partecipanti", eventoId]`

ma la lista del tab Partecipanti usa la chiave `["evento-partecipanti", eventoId]` (singolare "evento"). Nessuna delle chiavi invalidate combacia, quindi la lista resta quella in cache e sembra che il partecipante non sia stato creato. Ricaricando la pagina i partecipanti compaiono.

Nota secondaria: i partecipanti creati da import hanno `nome`/`cognome` NULL e mostrano l'etichetta ricavata dal cliente/contatto collegato (comportamento previsto dalla catena di fallback del titolo riga).

## Correzione proposta (un solo file)

`src/components/eventi/riconcilia-import-card.tsx`, funzione `dopoAzione`: aggiungere l'invalidazione di `["evento-partecipanti", eventoId]` (mantenendo le altre chiavi). Nessuna modifica a RPC, database o logica di import.
