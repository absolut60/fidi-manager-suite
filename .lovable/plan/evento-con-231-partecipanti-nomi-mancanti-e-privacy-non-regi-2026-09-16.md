# Evento con 231 partecipanti: nomi mancanti e privacy non registrata

## Cosa dicono i dati (verificato)

Evento `75ef3412-bcd8-4f2b-9c31-616919a6ca57` — 231 partecipanti, tutti `origine = 'import'`.
- con cliente: 20 — con lead: 211 — con contatto: 212 — senza nome e cognome: 19
- Import: `5262c334-…` del 16/09/2026 09:12:02 → 09:13:17, 231 righe, stato completata (le migrazioni su origine/privacy sono delle 07:18, quindi l'import è successivo: il codice nuovo era già attivo)
- Righe di staging: 216 `lead_creato`, 23 `collegato`, 2 `scartato` — tutte e 239 hanno nome/cognome nel file

## Problema 1 — nomi "—" sui riconciliati a cliente

I 19 partecipanti senza nome sono esattamente quelli collegati a un cliente esistente
(`contatto_id` nullo, `nome`/`cognome`/`email`/`ragione_sociale` tutti nulli).
`collega_righe_import` inserisce solo gli id (cliente/lead/contatto/note): i dati anagrafici
della riga importata non vengono copiati sul partecipante e nessun contatto viene creato.
Il nome della persona resta solo nella riga di staging `eventi_import_righe`, non è perso.

Correzione: in `collega_righe_import`, copiare nome, cognome, ragione sociale, email, telefono,
codice fiscale e partita IVA della riga nel partecipante creato (fallback visuale), e — quando
la riga ha un nome persona — creare/riusare il contatto sul cliente tramite
`crea_o_riusa_contatto_in_soggetto`, come già fa il percorso "crea lead".
Backfill dei 19 partecipanti esistenti dalle rispettive righe di staging.

## Problema 2 — privacy "Non raccolta" invece di "Da gruppo"

Nessuna riga in `consensi_log` con `origine = 'azienda_gruppo'` (0 in tutto il database) e i
contatti da import hanno `privacy_firmata = false`.
Causa: la whitelist è stata aggiornata nella funzione `registra_consensi_batch`, ma il vincolo
di tabella è rimasto indietro:

```text
consensi_log_origine_check CHECK (origine IN
  ('link_pubblico','operatore','recesso_link','import','firma_grafica','di_persona','qr_whatsapp'))
```

L'INSERT viola il CHECK, l'eccezione viene assorbita dal blocco non fatale nelle due funzioni di
import, quindi la privacy non viene mai scritta e nemmeno `privacy_firmata` aggiornato.

Correzione: estendere il CHECK di `consensi_log` con `'azienda_gruppo'`, poi rigenerare la privacy
da gruppo per i 212 contatti già creati da questo import (5 righe di consenso ciascuno +
`privacy_firmata = true`, `data_firma`).

## Dettagli tecnici

Tutto via migrazione, nessuna modifica al codice TypeScript prevista:
1. `ALTER TABLE public.consensi_log DROP CONSTRAINT consensi_log_origine_check` e ricreato con
   `'azienda_gruppo'` aggiunto (resto identico).
2. `CREATE OR REPLACE FUNCTION public.collega_righe_import` — identica salvo l'INSERT in
   `eventi_partecipanti` (aggiunta dei campi anagrafici dalla riga) e la creazione del contatto
   quando la riga ha un nome persona; firma, SECURITY DEFINER, search_path e grant preservati.
3. Backfill mirato al solo evento `75ef3412-…`:
   - anagrafica dei 19 partecipanti dalle righe `collegato` corrispondenti;
   - privacy da gruppo per i contatti dei partecipanti `origine='import'` privi di consensi,
     riusando `registra_consensi_batch` (nessuna logica duplicata).

Da confermare: il backfill va limitato a questo evento o esteso a tutti i partecipanti da import.
