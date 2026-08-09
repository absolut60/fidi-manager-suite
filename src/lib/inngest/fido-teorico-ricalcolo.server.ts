import { inngest, sendInngestEvent } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Catena di ricalcolo del precalcolo fido teorico
 * (public.fido_teorico_cliente): avvio → blocchi da 500 concatenati →
 * finalizzazione. Nessun singolo passo supera pochi secondi, così non si
 * incappa mai nel timeout di sessione.
 */
export const ricalcolaFidoTeoricoAvvia = inngest.createFunction(
  {
    id: "ricalcola-fido-teorico-avvia",
    name: "Ricalcolo fido teorico — avvio",
    retries: 2,
    triggers: [{ event: "fido-teorico/ricalcolo.requested" }],
  },
  async ({ step }) => {
    await step.run("refresh-fatturato", async () => {
      const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_avvia");
      if (error) throw new Error(error.message);
      return { ok: true };
    });

    await step.run("primo-blocco", async () => {
      await sendInngestEvent("fido-teorico/ricalcolo.blocco", { dopoId: null });
      return { ok: true };
    });

    return { avviato: true };
  },
);

export const ricalcolaFidoTeoricoBlocco = inngest.createFunction(
  {
    id: "ricalcola-fido-teorico-blocco",
    name: "Ricalcolo fido teorico — blocco",
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ event: "fido-teorico/ricalcolo.blocco" }],
  },
  async ({ event, step }) => {
    const dopoId = ((event.data ?? {}) as { dopoId?: string | null }).dopoId ?? null;

    const ultimoId = await step.run("processa-blocco", async () => {
      const { data, error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_blocco", {
        _dopo_id: dopoId,
        _dimensione: 500,
      } as never);
      if (error) throw new Error(error.message);
      return (data as unknown as string | null) ?? null;
    });

    if (!ultimoId) {
      await step.run("finalizza", async () => {
        const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_finalizza");
        if (error) throw new Error(error.message);
        return { ok: true };
      });
      return { done: true };
    }

    await step.run("prossimo-blocco", async () => {
      await sendInngestEvent("fido-teorico/ricalcolo.blocco", { dopoId: ultimoId });
      return { ok: true };
    });

    return { continua: true, dopoId: ultimoId };
  },
);
