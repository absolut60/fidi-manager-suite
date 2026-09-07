# Diagnosi: campagne marketing ferme in "in_corso"

Solo analisi, nessuna modifica applicata.

## 1) File

`src/lib/inngest/campagna-marketing.server.ts` — funzione `invioCampagnaMarketing`, trigger `campagna-marketing/invio.requested`. Registrata in `src/routes/api/public/inngest.ts`.

## 2) Come cicla i destinatari

- Step `collect-pending-ids`: legge in un colpo solo gli id con `stato_invio = 'da_inviare'`, ordinati per `aggiunto_il`.
- Blocchi da `campagna_marketing_blocco` (valore reale in `configurazioni`: **12**).
- Fra un blocco e l'altro: `await step.sleep("pausa-b", "60s")` (`campagna_marketing_pausa_sec` = **60**). Nessuna pausa fra i singoli invii dentro il blocco.

```ts
const numBlocchi = Math.ceil(total / cfg.blocco);
for (let b = 0; b < numBlocchi; b++) {
  const guard = await step.run(`guard-${b}`, ...);      // controlla 'annullata'
  const slice = pendingIds.slice(b * cfg.blocco, (b + 1) * cfg.blocco);
  const blockResult = await step.run(`blocco-${b}`, async () => { /* invii */ });
  if (b < numBlocchi - 1 && cfg.pausa > 0) await step.sleep(`pausa-${b}`, `${cfg.pausa}s`);
}
```

## 3) Rate-limit / errori SMTP

Nessuna gestione specifica del rate-limit e nessun trattamento speciale di 421/451. `sendEmailViaEdge` non lancia: ritorna `{ok:false, err}`. Il job marca la riga `fallito` e **prosegue** con il destinatario successivo; le eccezioni sono catturate dallo stesso try/catch per riga. `retries: 2` a livello di funzione vale solo per un fallimento dello step intero.

## 4) Guard anti-doppione

Sì, per riga: la riga viene riletta nel blocco e saltata se non è più `da_inviare`.

```ts
if (d.stato_invio !== "da_inviare") continue;
...
await supabaseAdmin.from("campagne_email_destinatari")
  .update({ stato_invio: "inviato", inviato_at: ..., message_id: sendRes.messageId ?? null })
  .eq("id", d.id);
```
La marcatura `inviato` avviene solo dopo `sendRes.ok === true`. Nota: la rilettura avviene una volta per blocco (12 righe), non immediatamente prima del singolo `sendMail`; due esecuzioni simultanee sullo stesso blocco potrebbero teoricamente sovrapporsi, ma non è questo il caso osservato.

## 5) Limite di step/tempo — CAUSA PROBABILE

La funzione dichiara:

```ts
{ id: "invio-campagna-marketing", retries: 2, timeouts: { finish: "30m" }, ... }
```

**Non esiste alcun cap "processa max N e riemetti l'evento"**: il ciclo prova a coprire in una sola esecuzione tutti i destinatari, con 60s di pausa ogni 12 invii. Su 1.000 destinatari servirebbero ~83 blocchi ≈ 83 minuti, ben oltre i 30 minuti di `finish`.

I dati confermano la firma del problema — tutte e 5 le campagne si sono fermate a **215/216 inviati**, cioè esattamente 18 blocchi × 12:

| Campagna | totale | inviati | da_inviare | ultimo invio |
|---|---|---|---|---|
| Casorezzo | 1160 | 215 | 944 | 14:30 |
| Lissone | 921 | 216 | 705 | 14:34 |
| Vercelli | 822 | 216 | 606 | 14:36 |
| Milano Affori | 1076 | 228 | 848 | 14:44 |
| Savigliano | 482 | 216 | 266 | 14:44 |

18 blocchi = 17 pause da 60s = ~17 min di sleep + tempo di invio → la corsa raggiunge il tetto dei 30 minuti e viene terminata a metà. Il timeout `finish` non passa da `onFailure`, quindi la campagna resta `in_corso` e nessuna riga viene marcata in errore: coerente con "nessun errore registrato".

## 6) Completata vs in_corso

Solo lo step finale `finalize` chiude la campagna (`completata`, oppure `completata_con_errori` se `falliti > 0`), e viene raggiunto solo se il ciclo termina tutti i blocchi. Il guard `annullata` è controllato prima di ogni blocco (`guard-${b}`) e di nuovo dentro `finalize`. Se la corsa muore per timeout, nessuno scrive lo stato finale → resta `in_corso` per sempre.

## 7) Rilanciare l'evento è sicuro?

Sì, riprende solo dai rimasti: `collect-pending-ids` filtra `stato_invio = 'da_inviare'`, e il guard per riga rifiuta comunque tutto ciò che non è `da_inviare`. Chi ha già ricevuto **non** viene reinviato. L'unica accortezza è non far girare due esecuzioni contemporanee sulla stessa campagna.

Attenzione però: rilanciando così com'è, ogni corsa coprirà di nuovo solo ~216 destinatari prima di scadere. Per Casorezzo (944 rimasti) servirebbero circa 5 rilanci manuali.

## Rimedi possibili (non applicati)

1. Alzare `timeouts.finish` — palliativo: con 60s ogni 12 invii, 1.000 destinatari richiedono ~83 minuti.
2. Ridurre la pausa o aumentare la dimensione del blocco in `configurazioni` (es. blocco 25 / pausa 20s), compatibilmente con i limiti SMTP del provider.
3. Soluzione strutturale: cap per esecuzione (es. max 150 destinatari), poi re-emit dell'evento `campagna-marketing/invio.requested` — il job è già idempotente, quindi la ripresa è sicura.
4. Aggiungere un rilevamento delle campagne "bloccate" (in_corso senza attività da X minuti) per riavviarle in automatico.

Dimmi quale strada preferisci e preparo il piano di intervento.
