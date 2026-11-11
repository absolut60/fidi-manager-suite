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

    // La RLS di clienti_blocco_variazioni limita la lettura all'ambito utente:
    // per sapere se c'è qualcosa da avvisare serve il service role, dopo la guardia.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("clienti_blocco_variazioni")
      .select("id", { count: "exact", head: true })
      .in("tipo", ["in_legale", "uscito_legale"])
      .is("notificato_at", null);
    if (error) throw new Error(`Lettura variazioni legale: ${error.message}`);
    if (!count) return { ok: true, inviato: false };

    // FM50: evento differito; il debounce (5 min) raggruppa le modifiche e
    // poi emette una sola volta "clienti/blocco.variazioni.rileva".
    const { sendInngestEvent } = await import("@/lib/inngest/client");
    await sendInngestEvent("clienti/legale.variazioni.differita", {});
    return { ok: true, inviato: true };
  });
