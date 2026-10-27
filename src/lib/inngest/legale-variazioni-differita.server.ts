// FM50: avvisi legale raggruppati. Le modifiche dall'app emettono
// "clienti/legale.variazioni.differita"; il debounce (5 min di quiete, max 15)
// le raccoglie tutte (nessuna chiave) e fa partire UNA volta il job esistente
// notificaVariazioniBlocco, che raggruppa per negozio. Emissione via
// sendInngestEvent (step.sendEvent in questo progetto non emette).
import { inngest } from "./client";
import { sendInngestEvent } from "./client";

export const avvisoLegaleDifferito = inngest.createFunction(
  {
    id: "clienti-legale-variazioni-differita",
    name: "Avviso variazioni legale differito (debounce)",
    retries: 3,
    debounce: { period: "5m", timeout: "15m" },
    triggers: [{ event: "clienti/legale.variazioni.differita" }],
  },
  async ({ step }) => {
    await step.run("emetti-rileva-variazioni", async () => {
      await sendInngestEvent("clienti/blocco.variazioni.rileva", { importazioneId: null });
      return true;
    });
    return { ok: true };
  },
);
