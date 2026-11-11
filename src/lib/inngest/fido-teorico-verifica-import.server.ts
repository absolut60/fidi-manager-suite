import { inngest, sendInngestEvent } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFonteImportFidoTeorico, leggiStatoImportCompleti } from "@/lib/fido-teorico-import-completi";

/**
 * Solo la chiusura delle quattro fonti canoniche emette la verifica.
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
  async ({ event, step }) => {
    const stato = await step.run("applica-regola", async () => {
      const importazioneId = (event.data as { importazioneId?: string }).importazioneId;
      if (!importazioneId) return null;
      const { data, error } = await supabaseAdmin.from("importazioni")
        .select("fonte").eq("id", importazioneId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!isFonteImportFidoTeorico(data?.fonte)) return null;
      return leggiStatoImportCompleti(supabaseAdmin);
    });
    if (!stato) return { avviato: false, motivo: "fonte_non_pertinente" };
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
