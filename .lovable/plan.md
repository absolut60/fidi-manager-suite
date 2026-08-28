# Timeout del database sulle pagine pesanti

I log confermano il problema: alcune query superano il limite di tempo del database (57014) e le pagine non caricano. Le statistiche del database indicano con precisione i responsabili.

## I colpevoli misurati

| Query | Chiamate | Tempo medio | Peggiore |
|---|---|---|---|
| `get_clienti_scadenziario()` (scadenziario) | 9.114 | 1,74 s | 7,98 s |
| Vista `fatturato_annuale_globale` | 1.051 | 3,94 s | 7,95 s |
| Vista `fatturato_ytd_globale` | 865 | 4,22 s | 7,93 s |
| Letture su `clienti` senza filtro (fido/scaduto) | ~25.000 | 0,36–0,48 s | 7,9 s |

Il timeout è a 8 secondi: i picchi di tutte e quattro le query lo sfiorano, quindi sono queste a generare i 34 annullamenti.

## Interventi proposti

1. **Fatturato globale**: trasformare `fatturato_annuale_globale` e `fatturato_ytd_globale` da viste calcolate ad ogni apertura a tabelle di riepilogo aggiornate dal job mensile già esistente (`refresh_fatturato_mensile`), con aggiornamento anche giornaliero per l'anno in corso. Da ~4 s a pochi millisecondi.
2. **Scadenziario**: rivedere il corpo di `get_clienti_scadenziario()` (aggregazioni ripetute sulle scadenze) e aggiungere gli indici mancanti sulle colonne di filtro/join usate. Obiettivo: sotto i 300 ms, con risultati identici verificati riga per riga prima e dopo.
3. **Letture su `clienti`**: le chiamate che leggono fido/scaduto scaricano l'intera anagrafica per calcolare pochi totali. Sostituirle con conteggi lato database (già esiste il pattern usato per la dashboard fidi), così il browser non scarica migliaia di righe.
4. **Verifica**: per ogni punto, confronto dei numeri prima/dopo e misura dei tempi, senza cambiare cosa vede l'utente.

## Note tecniche

- Tutto lato database (migrazioni) più piccoli adeguamenti nei componenti che oggi fanno le select larghe su `clienti`.
- Nessuna modifica a permessi e visibilità: le funzioni restano `SECURITY DEFINER` con lo stesso scoping per sede/ruolo.
- Consiglio di procedere per passi separati (prima fatturato, poi scadenziario, poi clienti) così ogni passo è verificabile in isolamento.
