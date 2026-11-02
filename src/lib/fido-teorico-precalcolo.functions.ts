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
  .inputValidator((d: { token?: string | null } | undefined) => {
    const t = d?.token ?? null;
    if (t !== null && !/^[0-9a-f-]{36}$/i.test(t)) throw new Error("Identificativo ricalcolo non valido");
    return { token: t };
  })
  .handler(async ({ context, data }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const { passoAvvia, nomeUtente } = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    const token = data.token ?? crypto.randomUUID();
    const avviatoDa = await nomeUtente(context.userId).catch(() => null);
    return { ...(await passoAvvia({ token, origine: "manuale", avviatoDa })), token };
  });

const UUID = /^[0-9a-f-]{36}$/i;
function tokenValido(t: unknown): string {
  if (typeof t !== "string" || !UUID.test(t)) throw new Error("Identificativo ricalcolo non valido");
  return t;
}

export const ricalcoloFidoBlocco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; dopoId: string | null; numero: number; previsti: number | null }) => {
    const id = d?.dopoId ?? null;
    if (id !== null && !UUID.test(id)) throw new Error("Identificativo blocco non valido");
    const numero = Number.isInteger(d?.numero) && d.numero > 0 ? d.numero : 1;
    const previsti = Number.isInteger(d?.previsti) ? (d.previsti as number) : null;
    return { token: tokenValido(d?.token), dopoId: id, numero, previsti };
  })
  .handler(async ({ context, data }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const { passoBlocco } = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    return { ultimoId: await passoBlocco({ token: data.token, origine: "manuale" }, data.dopoId, data.numero, data.previsti) };
  });

export const ricalcoloFidoChiudi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; passo: "finalizza" | "alert" | "chiusura" }) => {
    if (!["finalizza", "alert", "chiusura"].includes(d?.passo)) throw new Error("Passo non valido");
    return { token: tokenValido(d?.token), passo: d.passo };
  })
  .handler(async ({ context, data }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    const p = await import("@/lib/fido-teorico-ricalcolo-passi.server");
    const lock = { token: data.token, origine: "manuale" as const };
    if (data.passo === "finalizza") await p.passoFinalizza(lock);
    else if (data.passo === "alert") await p.passoAlertFidi(lock);
    else {
      await p.passoNotificheAlertFidi(lock);
      await p.passoRegistraOrigine("manuale");
      await p.passoRilasciaLock(data.token);
    }
    return { ok: true };
  });
