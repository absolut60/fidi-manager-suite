import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DIMENSIONE_BLOCCO = 1000;
const MAX_ITERAZIONI = 200;

/**
 * Ricalcolo del precalcolo fido teorico (public.fido_teorico_cliente).
 * Unica funzione Inngest: refresh → loop di blocchi da 1000 (uno step per
 * blocco, id univoco così Inngest li memoizza) → finalizzazione.
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
      const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_avvia");
      if (error) throw new Error(error.message);
      return { ok: true };
    });

    let dopoId: string | null = null;
    let blocchi = 0;

    for (let i = 0; i < MAX_ITERAZIONI; i++) {
      const idCorrente: string | null = dopoId;
      const ultimoId = (await step.run(
        `blocco-${i}`,
        async (): Promise<string | null> => {
          const res = await supabaseAdmin.rpc(
            "ricalcola_fido_teorico_blocco",
            { _dopo_id: idCorrente, _dimensione: DIMENSIONE_BLOCCO } as never,
          );
          if (res.error) throw new Error(res.error.message);
          return (res.data as unknown as string | null) ?? null;
        },
      )) as string | null;


      if (!ultimoId) break;
      dopoId = ultimoId;
      blocchi += 1;

      if (i === MAX_ITERAZIONI - 1) {
        throw new Error(
          `Ricalcolo fido teorico: superato il tetto di ${MAX_ITERAZIONI} blocchi (ultimo id ${dopoId}).`,
        );
      }
    }

    await step.run("finalizza", async () => {
      const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_finalizza");
      if (error) throw new Error(error.message);
      return { ok: true };
    });

    // FM55: alert fidi (consumo, riduzione, extra non usato) sui dati appena ricalcolati.
    const alertFidi = await step.run("aggiorna-alert-fidi", async () => {
      const { data, error } = await supabaseAdmin.rpc("aggiorna_alert_fidi" as never);
      if (error) throw new Error(error.message);
      return data as unknown;
    });

    // FM55: nessuna scrittura se l'interruttore DB non è esattamente 'true'.
    const notificheAlertFidi = await step.run("invia-notifiche-alert-fidi", async () => {
      const { data, error } = await supabaseAdmin.rpc("invia_notifiche_alert_fidi" as never);
      if (error) throw new Error(error.message);
      return data as unknown;
    });

    // Origine dell'ultimo ricalcolo (automatico | manuale), letta da card e avviso.
    await step.run("registra-origine", async () => {
      const { error } = await supabaseAdmin.from("configurazioni").upsert(
        {
          chiave: "fido_teorico_ultimo_ricalcolo_origine",
          valore: origine,
          descrizione: "Origine dell'ultimo ricalcolo del fido teorico (automatico | manuale)",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chiave" },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    });

    return { origine, alert_fidi: alertFidi, notifiche_alert_fidi: notificheAlertFidi, blocchi_elaborati: blocchi, ultimo_id: dopoId, finalizzato: true };
  },
);
