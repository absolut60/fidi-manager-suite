// Avviso immediato delle variazioni legale (FM48).
// Il trigger registra_variazione_legale() scrive solo la riga in
// clienti_blocco_variazioni; dopo le operazioni sulle pratiche l'app chiama
// questa funzione, che fa partire il job degli avvisi blocco/legale.
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

    const { sendInngestEvent } = await import("@/lib/inngest/client");
    await sendInngestEvent("clienti/blocco.variazioni.rileva", { importazioneId: null });
    return { ok: true, inviato: true };
  });
