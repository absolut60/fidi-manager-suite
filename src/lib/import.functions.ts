import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "./inngest/client";
import { assertImportazioneEsiste, assertPuoImportareGamma } from "@/lib/import-permessi.server";

const FonteEnum = z.enum([
  "anagrafica",
  "analisi_rischio",
  "scadenziario",
  "scadenziario_assicurazioni",
  "blocco_fido_assicurazione",
]);

/**
 * Avvia un import in background tramite Inngest.
 * Il file deve essere già stato caricato sullo storage e una riga in
 * `importazioni` deve essere già stata creata (stato in_elaborazione).
 */
export const triggerImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      fonte: FonteEnum,
      importazioneId: z.string().uuid(),
      filePath: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    await assertImportazioneEsiste(context.supabase, data.importazioneId);
    // FM50: un solo import scadenziario alla volta. Blocca se un altro è
    // in_elaborazione da meno di 3 ore; quelli più vecchi non bloccano.
    if (data.fonte === "scadenziario") {
      const soglia = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data: inCorso, error } = await context.supabase
        .from("importazioni")
        .select("id")
        .eq("fonte", "scadenziario")
        .eq("stato", "in_elaborazione")
        .gte("created_at", soglia)
        .neq("id", data.importazioneId)
        .limit(1);
      if (error) throw new Error(`Verifica import in corso non riuscita: ${error.message}`);
      if (inCorso && inCorso.length > 0) {
        const messaggio = "C'è già un import scadenziario in corso: attendi che finisca";
        // Chiude la riga appena creata, così non resta "in elaborazione".
        await context.supabase
          .from("importazioni")
          .update({
            stato: "fallita",
            completata_at: new Date().toISOString(),
            log_errori: [{ riga: 0, errore: messaggio }],
            problemi: [messaggio],
          })
          .eq("id", data.importazioneId);
        throw new Error(messaggio);
      }
    }
    await sendInngestEvent(`import/${data.fonte}.requested`, {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
      userId: context.userId,
    });
    return { ok: true };
  });

// Backward-compat: alias per AnagraficaImportCard esistente
export const triggerAnagraficaImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      importazioneId: z.string().uuid(),
      filePath: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    await assertImportazioneEsiste(context.supabase, data.importazioneId);
    await sendInngestEvent("import/anagrafica.requested", {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
      userId: context.userId,
    });
    return { ok: true };
  });
