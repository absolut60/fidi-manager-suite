import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "./inngest/client";

/**
 * Avvia l'import anagrafica in background tramite Inngest.
 * Il file deve essere già stato caricato sullo storage e una riga in
 * `importazioni` deve già essere stata creata (in stato in_elaborazione).
 */
export const triggerAnagraficaImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      importazioneId: z.string().uuid(),
      filePath: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await sendInngestEvent("import/anagrafica.requested", {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
    });
    return { ok: true };
  });
