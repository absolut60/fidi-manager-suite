import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoImportareGamma } from "@/lib/import-permessi.server";

/**
 * Avvia in background (Inngest) il ricalcolo del precalcolo persistente del
 * fido teorico. Non duplica la logica: il job chiama la RPC canonica
 * public.ricalcola_fido_teorico() con service_role (nessun timeout di 8s).
 *
 * Autorizzazione (FM41): stessa regola della pagina Import/Export
 * (puoImportareGamma, fonte unica RUOLI_IMPORT_GAMMA).
 */
export const ricalcolaFidoTeorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId);
    const { sendInngestEvent } = await import("@/lib/inngest/client");
    await sendInngestEvent("fido-teorico/ricalcolo.requested", {});
    return { avviato: true };
  });
