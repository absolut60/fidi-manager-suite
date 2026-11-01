import { inngest } from "./client";
import {
  passoAvvia,
  passoBlocco,
  passoFinalizza,
  passoAlertFidi,
  passoNotificheAlertFidi,
  passoRegistraOrigine,
} from "@/lib/fido-teorico-ricalcolo-passi.server";
import { MAX_BLOCCHI_RICALCOLO } from "@/lib/fido-teorico-ricalcolo-riprova";

const MAX_ITERAZIONI = MAX_BLOCCHI_RICALCOLO;

/**
 * Ricalcolo automatico del precalcolo fido teorico (public.fido_teorico_cliente).
 * Stessi passi del pulsante manuale (fido-teorico-ricalcolo-passi.server.ts),
 * uno step Inngest per passo e per ogni blocco da 200 (con riprova sui timeout dentro
 * il passo): se un blocco fallisce, Inngest riprende da quel blocco.
 * finalizza e aggiorna_alert_fidi partono solo dopo l'ultimo blocco riuscito.
 * Nessun evento che ri-triggera sé stesso.
 */
export const ricalcolaFidoTeorico = inngest.createFunction(
  {
    id: "ricalcola-fido-teorico",
    name: "Ricalcolo fido teorico",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: "fido-teorico/ricalcolo.requested" }],
  },
  async ({ event, step }) => {
    const origine =
      (event.data as { origine?: string } | undefined)?.origine === "automatico"
        ? "automatico"
        : "manuale";
    await step.run("refresh-fatturato", async () => {
      await passoAvvia();
      return { ok: true };
    });

    let dopoId: string | null = null;
    let blocchi = 0;

    for (let i = 0; i < MAX_ITERAZIONI; i++) {
      const idCorrente: string | null = dopoId;
      const ultimoId = (await step.run(`blocco-${i}`, async (): Promise<string | null> => passoBlocco(idCorrente))) as string | null;
      if (!ultimoId) break;
      dopoId = ultimoId;
      blocchi += 1;
      if (i === MAX_ITERAZIONI - 1) {
        throw new Error(`Ricalcolo fido teorico: superato il tetto di ${MAX_ITERAZIONI} blocchi (ultimo id ${dopoId}).`);
      }
    }

    await step.run("finalizza", async () => {
      await passoFinalizza();
      return { ok: true };
    });
    const alertFidi = await step.run("aggiorna-alert-fidi", async () => passoAlertFidi());
    const notificheAlertFidi = await step.run("invia-notifiche-alert-fidi", async () => passoNotificheAlertFidi());
    await step.run("registra-origine", async () => {
      await passoRegistraOrigine(origine);
      return { ok: true };
    });

    return { origine, alert_fidi: alertFidi, notifiche_alert_fidi: notificheAlertFidi, blocchi_elaborati: blocchi, ultimo_id: dopoId, finalizzato: true };
  },
);
