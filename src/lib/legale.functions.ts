// FM60: il trigger registra_variazione_legale() scrive la riga da comunicare.
// Questa funzione resta come completamento delle operazioni dall'app, ma non emette
// più eventi: il solo job a orario fisso raccoglie e comunica le righe non notificate.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const avvisaVariazioniLegale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; inviato: boolean }> => {
    const { assertPuoGestireLegale } = await import("@/lib/recupero-permessi.server");
    await assertPuoGestireLegale(context.supabase);
    return { ok: true, inviato: false };
  });
