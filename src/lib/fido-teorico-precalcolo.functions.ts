import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Avvia in background (Inngest) il ricalcolo del precalcolo persistente del
 * fido teorico. Non duplica la logica: il job chiama la RPC canonica
 * public.ricalcola_fido_teorico() con service_role (nessun timeout di 8s).
 */
export const ricalcolaFidoTeorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sendInngestEvent } = await import("@/lib/inngest/client");
    await sendInngestEvent("fido-teorico/ricalcolo.requested", {});
    return { avviato: true };
  });
