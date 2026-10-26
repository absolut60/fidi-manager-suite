// Generazione PDF lettera lato server (TanStack serverFn, runtime Cloudflare Workers).
// Libreria: pdf-lib (pure JS, compatibile Workers, gia in dipendenze).
// FASE 2a: carta intestata basilare (logo + sede + destinatario + corpo + firma + footer legale).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoInviareRecupero } from "@/lib/recupero-permessi.server";
import { costruisciLetteraPdf } from "@/lib/lettera-pdf.server";

type Input = {
  templateId?: string | null;
  clienteId: string;
  oggettoOverride?: string | null;
  corpoOverride?: string | null;
  attachToAzioneId?: string | null;
};

export const generaLetteraPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data?.clienteId) throw new Error("clienteId mancante");
    // templateId opzionale (modalita libera): richiede oggetto+corpo override
    if (!data?.templateId) {
      if (!data?.corpoOverride || !data.corpoOverride.trim()) {
        throw new Error("In modalita libera: oggetto e corpo sono richiesti");
      }
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPuoInviareRecupero(supabase);

    // 1-4) Template, cliente, sede, scadute, operatore, spese, render e PDF: fonte unica
    const { pdfBytes, fileName, tplNome, tpl } = await costruisciLetteraPdf(supabase, userId, data);

    // 5) Determina azione di aggancio (riusa o crea)
    let azioneId = data.attachToAzioneId ?? null;
    let creataAzione = false;
    if (!azioneId) {
      const { data: insAz, error: eAz } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: data.clienteId,
          operatore_id: userId,
          tipo: "lettera",
          esito: "fatto",
          data_azione: new Date().toISOString(),
          note: `Lettera generata: ${tplNome}`,
        })
        .select("id")
        .single();
      if (eAz) throw eAz;
      azioneId = insAz.id;
      creataAzione = true;
    }

    // 6) Upload su bucket allegati + insert in tabella allegati
    const storagePath = `azione_recupero/${azioneId}/${crypto.randomUUID()}-${fileName}`;
    const { error: eUp } = await supabase.storage
      .from("allegati")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (eUp) {
      // Se abbiamo creato un'azione apposta e l'upload fallisce, rimuoviamola (nessun residuo)
      if (creataAzione && azioneId) {
        await supabase.from("azioni_recupero").delete().eq("id", azioneId);
      }
      throw new Error(`Upload PDF fallito: ${eUp.message}`);
    }

    const { data: insAll, error: eIns } = await supabase
      .from("allegati")
      .insert({
        entita_tipo: "azione_recupero",
        entita_id: azioneId,
        cliente_id: data.clienteId,
        nome_file: fileName,
        storage_path: storagePath,
        mime_type: "application/pdf",
        dimensione_bytes: pdfBytes.byteLength,
        descrizione: tpl ? `Lettera generata da modello: ${tpl.nome}` : "Lettera generata (modalita libera)",
        caricato_da: userId,
      })
      .select("id")
      .single();
    if (eIns) {
      // rollback: rimuovi file e (se creata da noi) azione
      await supabase.storage.from("allegati").remove([storagePath]);
      if (creataAzione && azioneId) {
        await supabase.from("azioni_recupero").delete().eq("id", azioneId);
      }
      throw new Error(`Salvataggio allegato fallito: ${eIns.message}`);
    }

    // 7) Ritorna PDF in base64 (per download client)
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
    }
    const pdfBase64 = btoa(binary);

    return {
      ok: true as const,
      pdfBase64,
      fileName,
      allegatoId: insAll.id,
      azioneId,
      creataAzione,
    };
  });