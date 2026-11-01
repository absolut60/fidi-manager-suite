import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoImportareGamma } from "@/lib/import-permessi.server";

/**
 * Pulsante "Ricalcola fido teorico ora": la pagina esegue i passi uno alla volta
 * (avvia → blocchi → chiusura), così mostra l'avanzamento e l'errore reale.
 * I passi sono gli stessi del job automatico (fido-teorico-ricalcolo-passi.server.ts).
 *
 * Autorizzazione (FM41): stessa regola della pagina Import/Export
 * (puoImportareGamma, fonte unica RUOLI_IMPORT_GAMMA), verificata a ogni passo.
 */
export const ricalcoloFidoAvvia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const { passoAvvia } = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    return await passoAvvia();
  });

export const ricalcoloFidoBlocco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dopoId: string | null }) => {
    const id = d?.dopoId ?? null;
    if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identificativo blocco non valido");
    return { dopoId: id };
  })
  .handler(async ({ context, data }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const { passoBlocco } = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    return { ultimoId: await passoBlocco(data.dopoId) };
  });

export const ricalcoloFidoChiudi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { passo: "finalizza" | "alert" | "chiusura" }) => {
    if (!["finalizza", "alert", "chiusura"].includes(d?.passo)) throw new Error("Passo non valido");
    return d;
  })
  .handler(async ({ context, data }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const p = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    if (data.passo === "finalizza") await p.passoFinalizza();
    else if (data.passo === "alert") await p.passoAlertFidi();
    else {
      await p.passoNotificheAlertFidi();
      await p.passoRegistraOrigine("manuale");
    }
    return { ok: true };
  });
