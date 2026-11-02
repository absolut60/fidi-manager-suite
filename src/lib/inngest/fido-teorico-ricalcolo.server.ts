import { inngest } from "./client";
import {
  passoAvvia,
  passoBlocco,
  passoFinalizza,
  passoAlertFidi,
  passoNotificheAlertFidi,
  passoRegistraOrigine,
  passoRilasciaLock,
} from "@/lib/fido-teorico-ricalcolo-passi.server";
import { MAX_BLOCCHI_RICALCOLO } from "@/lib/fido-teorico-ricalcolo-riprova";
import { ErroreRicalcoloInCorso } from "@/lib/fido-teorico-ricalcolo-lock";

const MAX_ITERAZIONI = MAX_BLOCCHI_RICALCOLO;

/**
 * Ricalcolo automatico del precalcolo fido teorico (public.fido_teorico_cliente).
 * Stessi passi del pulsante manuale (fido-teorico-ricalcolo-passi.server.ts),
 * uno step Inngest per passo e per ogni blocco da 200 (con riprova sui timeout dentro
 * il passo): se un blocco fallisce, Inngest riprende da quel blocco.
 * finalizza e aggiorna_alert_fidi partono solo dopo l'ultimo blocco riuscito.
 * Un solo ricalcolo alla volta: concurrency 1 e lock DB condiviso col pulsante;
 * se il lock è di un altro ricalcolo attivo, il job termina senza ricalcolare.
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
    // Token del lock memorizzato da Inngest: le riprove degli step usano lo stesso.
    const token = await step.run("token-lock", async () => crypto.randomUUID());
    const lock = { token, origine } as const;
    const avvio = await step.run("refresh-fatturato", async () => {
      try {
        const r = await passoAvvia(lock);
        return { ok: true as const, previsti: r.blocchiPrevisti, motivo: null };
      } catch (e) {
        if (e instanceof ErroreRicalcoloInCorso) return { ok: false as const, previsti: 0, motivo: e.message };
        throw e;
      }
    });
    if (!avvio.ok) return { origine, saltato: true, motivo: avvio.motivo };

    let dopoId: string | null = null;
    let blocchi = 0;

    for (let i = 0; i < MAX_ITERAZIONI; i++) {
      const idCorrente: string | null = dopoId;
      const ultimoId = (await step.run(`blocco-${i}`, async (): Promise<string | null> => passoBlocco(lock, idCorrente, i + 1, avvio.previsti))) as string | null;
      if (!ultimoId) break;
      dopoId = ultimoId;
      blocchi += 1;
      if (i === MAX_ITERAZIONI - 1) {
        throw new Error(`Ricalcolo fido teorico: superato il tetto di ${MAX_ITERAZIONI} blocchi (ultimo id ${dopoId}).`);
      }
    }

    await step.run("finalizza", async () => {
      await passoFinalizza(lock);
      return { ok: true };
    });
    const alertFidi = await step.run("aggiorna-alert-fidi", async () => passoAlertFidi(lock));
    const notificheAlertFidi = await step.run("invia-notifiche-alert-fidi", async () => passoNotificheAlertFidi(lock));
    await step.run("registra-origine", async () => {
      await passoRegistraOrigine(origine);
      await passoRilasciaLock(token);
      return { ok: true };
    });

    return { origine, alert_fidi: alertFidi, notifiche_alert_fidi: notificheAlertFidi, blocchi_elaborati: blocchi, ultimo_id: dopoId, finalizzato: true };
  },
);
