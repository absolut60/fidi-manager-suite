# Diagnosi: immagine template WhatsApp bloccata dalla sicurezza

## Causa

Il caricamento salva il file in una cartella che le regole di sicurezza non consentono. Non è un problema di ruoli né di archivio mancante.

- L'archivio usato è `email-assets` e **esiste** (privato).
- Il percorso costruito è `whatsapp-template/<id-template>/<uuid>.<ext>`.
- Le regole di sicurezza permettono scrittura/lettura **solo** nella cartella `campagne/`.
- Il ruolo dell'utente non c'entra: il controllo ruoli (marketing, amministratore, amministrazione, direzione) è soddisfatto; a bloccare è la prima cartella del percorso.

Effetto collaterale correlato: anche se il file venisse caricato, l'indirizzo pubblico generato (`/api/public/email-img/...`) serve unicamente i file sotto `campagne/`, quindi l'immagine non sarebbe comunque visibile a Meta/WhatsApp.

## Codice rilevante (verbatim)

`src/components/marketing/whatsapp-template-tab.tsx` righe 332-348:

```ts
  async function caricaImmagine(file: File) {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `whatsapp-template/${template.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("email-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Caricamento immagine fallito: ${error.message}`);
      setHeaderMedia(`/api/public/email-img/${path}`);
      toast.success("Immagine caricata");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore caricamento");
    } finally {
      setUploading(false);
    }
  }
```

## Stato attuale verificato

Bucket:

```text
id: email-assets | name: email-assets | public: false
```

Policy su `storage.objects` per `email-assets` (tutte con ruolo `authenticated`):

```text
DELETE email_assets_campagne_delete  qual:  bucket_id='email-assets' AND foldername(name)[1]='campagne' AND can_manage_email_assets()
INSERT email_assets_campagne_insert  check: bucket_id='email-assets' AND foldername(name)[1]='campagne' AND can_manage_email_assets()
SELECT email_assets_campagne_select  qual:  bucket_id='email-assets' AND foldername(name)[1]='campagne' AND can_manage_email_assets()
UPDATE email_assets_campagne_update  qual/check: idem
```

Gate ruoli `public.can_manage_email_assets()` (SQL, STABLE, SECURITY DEFINER, search_path=public):

```text
has_role(auth.uid(),'marketing') OR 'amministratore' OR 'amministrazione' OR 'direzione'
```

## Opzioni di correzione (da scegliere, non ancora applicate)

Opzione A — solo frontend, nessuna modifica al database:
- Cambiare il percorso in `campagne/whatsapp-template/<id-template>/<uuid>.<ext>`.
- Nessun altro intervento: le regole e l'indirizzo pubblico funzionano già per questa cartella.

Opzione B — separare le cartelle:
- Mantenere `whatsapp-template/` e aggiungere via migrazione le regole di sicurezza per quella cartella, più estendere la route pubblica delle immagini ad accettarla.
- Più lavoro, nessun vantaggio pratico rispetto ad A.

Raccomandazione: opzione A.

## Nota sui ruoli

Chi crea i template WhatsApp usa il gate marketing della pagina Campagne (marketing, amministrazione, direzione, amministratore): coincide con quello dell'archivio, quindi non serve toccare i permessi.
