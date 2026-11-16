# FM79 — Non-regressione telefono e PC

Scopo: dimostrare in ogni fetta tablet che **telefono e PC non cambiano di un pixel**.

- Script: `docs/verifiche/fm79-regressione/regressione.py` (misure di supporto in `misura.js`, stessa cartella).
- Pagine: tutte quelle in `src/routes/_app` (74), lette automaticamente dalla cartella, quindi una pagina nuova entra da sola nel controllo.
- Dimensioni:
  - **375×812** telefono (touch attivo);
  - **1280×800** e **1440×900** PC con mouse (`hasTouch:false`).
- Utente e dati sono simulati nel browser (amministratore, 14 righe finte per tabella con nomi lunghi e importi grandi): non serve accedere e non si scrive nulla nel database. Orologio fermo al 16/11/2026 09:00, animazioni spente, una sessione nuova per ogni pagina, fotografia scattata solo quando due immagini consecutive sono uguali.
- Le immagini vanno in `/tmp/fm79-regressione/prima` e `/tmp/fm79-regressione/dopo` (fuori dal progetto).

## Come si usa in ogni fetta

Con l'anteprima in esecuzione su `http://localhost:8080`:

```bash
# 1. PRIMA di toccare il codice
python3 docs/verifiche/fm79-regressione/regressione.py prima

# 2. applicare la fetta

# 3. DOPO la fetta (aspettare che l'anteprima abbia ricaricato)
python3 docs/verifiche/fm79-regressione/regressione.py dopo

# 4. confronto pixel per pixel
python3 docs/verifiche/fm79-regressione/regressione.py confronta
```

- `confronta` esce con codice 0 e scrive `diverse: 0` solo se **tutte** le immagini sono identiche. Altrimenti elenca file e zona dei pixel diversi ed esce con codice 1: la fetta non è finita.
- Prima di dichiarare una differenza, `confronta` rifotografa da sola le pagine diverse fino a 2 volte. Serve a distinguere un caricamento lento (per esempio il riquadro "Attiva le notifiche", che compare dopo un attimo) da un cambiamento vero.
- Durata: circa 15–20 minuti per l'intero giro (74 pagine × 3 dimensioni). Per una prova veloce si possono passare alcune pagine, separate da virgola, sia a `prima` sia a `dopo`:

```bash
python3 docs/verifiche/fm79-regressione/regressione.py prima /dashboard,/clienti,/richieste
python3 docs/verifiche/fm79-regressione/regressione.py dopo  /dashboard,/clienti,/richieste
python3 docs/verifiche/fm79-regressione/regressione.py confronta
```

  La prova veloce non sostituisce il giro completo a fine fetta.

## Prova dello script (16/11/2026)

Due giri `prima`/`dopo` senza alcuna modifica al codice su 6 pagine (dashboard, clienti, preventivi, richieste, scadenziario, lead) × 3 dimensioni = 18 immagini: `Confrontate 18 immagini, diverse: 0`. Al primo confronto una pagina era risultata diversa per il riquadro delle notifiche ancora in arrivo; la nuova fotografia automatica l'ha risolta.

## Limiti

- Le pagine di dettaglio (scheda cliente, preventivo, richiesta, …) con dati simulati restano sullo scheletro di caricamento: per loro lo script garantisce l'invarianza dell'impaginazione esterna, non del contenuto. Per le fette che le toccano serve in più una verifica con accesso vero.
- Le finestre (dialog) non vengono aperte dallo script: le fette che toccano `dialog.tsx`/`sheet.tsx` aggiungono fotografie a 375/1280/1440 delle finestre toccate, prima e dopo.
