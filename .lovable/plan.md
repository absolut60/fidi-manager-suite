## Fix bucket firma privacy

**Problema**: Errore "Bucket not found" al salvataggio del PDF firma. Il codice in `src/lib/firma-privacy.functions.ts` usa il bucket `privacy-pdf`, che pur esistendo nella configurazione attuale, deve essere sostituito con `documenti-privacy` (pubblico) come richiesto.

### 1. Migration Supabase
Creare il bucket `documenti-privacy` pubblico, con policy di lettura pubblica e di scrittura riservata al service role (l'upload avviene già via `supabaseAdmin`):

```sql
insert into storage.buckets (id, name, public)
values ('documenti-privacy', 'documenti-privacy', true)
on conflict (id) do update set public = true;

create policy "Public read documenti-privacy"
on storage.objects for select
using (bucket_id = 'documenti-privacy');
```

### 2. Aggiornamento codice
In `src/lib/firma-privacy.functions.ts`, sostituire l'unica occorrenza:
- `supabaseAdmin.storage.from("privacy-pdf")` → `supabaseAdmin.storage.from("documenti-privacy")` (sia per `upload` che per `getPublicUrl`).

Il bucket `firme` per il PNG della firma resta invariato (funziona correttamente).

### Note
- Il bucket esistente `privacy-pdf` non viene eliminato per preservare eventuali PDF già caricati.
- Essendo `documenti-privacy` pubblico, il `publicUrl` salvato in `clienti.privacy_pdf_url` sarà accessibile direttamente.
