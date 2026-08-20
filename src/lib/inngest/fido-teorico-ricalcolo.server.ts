import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DIMENSIONE_BLOCCO = 500;
const MAX_ITERAZIONI = 200;

/**
 * Ricalcolo del precalcolo fido teorico (public.fido_teorico_cliente).
 * Unica funzione Inngest: refresh → loop di blocchi da 500 (uno step per
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
  async ({ step }) => {
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

    return { blocchi_elaborati: blocchi, ultimo_id: dopoId, finalizzato: true };
  },
);
