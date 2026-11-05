import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Elimina un lead (punto unico public.elimina_lead, come l'utente: permessi e RLS invariati)
 * e poi cancella dallo Storage i file dei suoi allegati. Se la cancellazione dei file
 * fallisce il lead resta eliminato: l'errore va solo nel log.
 */
export const eliminaLeadConFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: paths, error } = await context.supabase.rpc("elimina_lead_con_file", {
      _lead_id: data.leadId,
    });
    if (error) throw new Error(error.message);
    const daCancellare = ((paths as string[] | null) ?? []).filter(Boolean);
    if (daCancellare.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: e } = await supabaseAdmin.storage.from("allegati").remove(daCancellare);
        if (e) console.error("[elimina-lead] file non cancellati", data.leadId, e.message);
      } catch (e) {
        console.error("[elimina-lead] file non cancellati", data.leadId, e);
      }
    }
    return { ok: true };
  });
