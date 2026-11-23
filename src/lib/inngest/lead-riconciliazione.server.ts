// FM99: riconciliazione lead -> cliente dopo l'import anagrafica clienti.
// Il motore è solo SQL (public.riconcilia_lead_clienti, eseguibile solo da service_role):
// qui lo si chiama con il client service-role. Regola: docs/regole/lead-riconciliazione.md.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type EsitoRiconciliazione = {
  collegati?: number;
  da_riconciliare?: number;
  chiusi?: number;
  errori?: unknown[];
  riconciliazioni?: string[];
};

export const riconciliaLeadDopoImport = inngest.createFunction(
  {
    id: "lead-riconciliazione-clienti",
    name: "Lead: riconciliazione con i clienti dopo l'import anagrafica",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: "lead/riconciliazione.rileva" }],
  },
  async ({ event, step, logger }) => {
    const importazioneId =
      ((event.data as { importazioneId?: string | null } | undefined)?.importazioneId ?? null) as
        | string
        | null;

    return await step.run("riconcilia", async () => {
      const { data, error } = await supabaseAdmin.rpc("riconcilia_lead_clienti" as never, {
        _importazione_id: importazioneId,
        _operatore: null,
      } as never);
      if (error) {
        throw new Error(`riconcilia_lead_clienti: ${(error as { message: string }).message}`);
      }
      const esito = (data ?? {}) as EsitoRiconciliazione;
      const errori = Array.isArray(esito.errori) ? esito.errori : [];
      if (errori.length > 0) {
        logger.warn(
          `Riconciliazione lead ${importazioneId ?? "-"}: ${errori.length} errori: ${JSON.stringify(errori)}`,
        );
      }
      logger.info(
        `Riconciliazione lead ${importazioneId ?? "-"}: collegati=${esito.collegati ?? 0}, da_riconciliare=${esito.da_riconciliare ?? 0}, chiusi=${esito.chiusi ?? 0}`,
      );
      return {
        collegati: esito.collegati ?? 0,
        da_riconciliare: esito.da_riconciliare ?? 0,
        chiusi: esito.chiusi ?? 0,
        errori: errori.length,
      };
    });
  },
);
