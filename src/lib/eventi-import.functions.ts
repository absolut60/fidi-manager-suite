import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "./inngest/client";

/**
 * Avvia l'import dei partecipanti di un evento in background (Inngest).
 * Il file deve essere già stato caricato sullo storage e la riga in
 * `importazioni` (fonte 'eventi_partecipanti') già creata.
 * L'import NON crea lead/contatti/partecipanti: popola solo lo staging.
 */
export const triggerEventiPartecipantiImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        importazioneId: z.string().uuid(),
        eventoId: z.string().uuid(),
        filePath: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await sendInngestEvent("import/eventi_partecipanti.requested", {
      importazioneId: data.importazioneId,
      eventoId: data.eventoId,
      filePath: data.filePath,
      userId: context.userId,
    });
    return { ok: true };
  });
