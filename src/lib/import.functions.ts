import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "./inngest/client";

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
    await sendInngestEvent("import/anagrafica.requested", {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
      userId: context.userId,
    });
    return { ok: true };
  });
