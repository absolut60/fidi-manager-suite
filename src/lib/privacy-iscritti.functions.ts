import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Allega il PDF privacy ai contatti degli iscritti WhatsApp indicati (dopo
 * riconciliazione/ri-verifica). Elabora solo gli id ricevuti; errori per id non fatali.
 */
export const allegaPrivacyIscritti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("auth_ha_ruolo_globale_clienti");
    if (error || ok !== true) throw new Error("non_autorizzato");

    const { allegaPrivacyIscrittoAContatto } = await import("./privacy-iscritto-whatsapp.server");
    let allegati = 0;
    for (const id of data.ids) {
      try {
        const r = await allegaPrivacyIscrittoAContatto(id);
        if (r.allegato) allegati++;
      } catch (e) {
        console.error(`[allega-privacy-iscritti] iscritto ${id}:`, e);
      }
    }
    return { allegati };
  });
