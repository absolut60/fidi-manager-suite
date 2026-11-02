import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoImportareGamma } from "@/lib/import-permessi.server";

/**
 * Pulsante "Ricalcola fido teorico ora" (FM55 fetta 8): prende il lock (chi clicca
 * per primo vince; con un ricalcolo attivo risponde ErroreRicalcoloInCorso) e invia
 * l'evento del job Inngest, che esegue gli STESSI passi dell'automatico
 * (fido-teorico-ricalcolo-passi.server.ts) con origine "manuale". Nessun blocco gira
 * nel browser: chiudere o ricaricare la pagina non ferma il ricalcolo.
 *
 * Autorizzazione (FM41): stessa regola della pagina Import/Export
 * (puoImportareGamma, fonte unica RUOLI_IMPORT_GAMMA).
 */
export const ricalcoloFidoAvvia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const p = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    const token = crypto.randomUUID();
    const avviatoDa = await p.nomeUtente(context.userId).catch(() => null);
    await p.passoLock(
      { token, origine: "manuale", avviatoDa },
      { fase: "preparazione", blocco: null, previsti: null },
      true,
    );
    try {
      const { sendInngestEvent } = await import("@/lib/inngest/client");
      await sendInngestEvent("fido-teorico/ricalcolo.requested", { origine: "manuale", token, avviatoDa });
    } catch (e) {
      await p.passoRilasciaLock(token).catch(() => {});
      throw e;
    }
    return { token };
  });
