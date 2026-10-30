import { inngest, sendInngestEvent } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { leggiStatoImportCompleti } from "@/lib/fido-teorico-import-completi";

/**
 * Alla chiusura di ogni import arriva `fido-teorico/verifica-import-completi`.
 * Debounce 2 minuti (i due import della card C finiscono quasi insieme) e
 * concurrency 1. Se la regola fonte unica (leggiStatoImportCompleti) è
 * soddisfatta, emette l'evento esistente del job `ricalcola-fido-teorico`.
 */
export const verificaImportCompletiFidoTeorico = inngest.createFunction(
  {
    id: "verifica-import-completi-fido-teorico",
    name: "Verifica import completi per il fido teorico",
    retries: 2,
    concurrency: { limit: 1 },
    debounce: { period: "2m" },
    triggers: [{ event: "fido-teorico/verifica-import-completi" }],
  },
  async ({ step }) => {
    const stato = await step.run("applica-regola", async () =>
      leggiStatoImportCompleti(supabaseAdmin),
    );
    if (!stato.pronto) {
      return { avviato: false, mancanti: stato.mancanti, inElaborazione: stato.inElaborazione };
    }
    await step.run("avvia-ricalcolo", async () => {
      await sendInngestEvent("fido-teorico/ricalcolo.requested", { origine: "automatico" });
      return { ok: true };
    });
    return { avviato: true };
  },
);
