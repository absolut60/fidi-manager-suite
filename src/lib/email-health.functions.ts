// Server function per la card "Stato canale email" in Impostazioni.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getStatoCanaleEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { raccogliStatoCanaleEmail } = await import("@/lib/inngest/email-health.server");
    return await raccogliStatoCanaleEmail();
  });
