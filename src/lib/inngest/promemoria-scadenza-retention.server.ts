// Retention: azzera promemoria_scadenza_log.email_html oltre 90 giorni.
// - Conserva metadati (esito, num_scadenze, importo, errore, ecc.) e la
//   tabella-ponte promemoria_scadenza_log_scadenze.
// - Idempotente: usa UPDATE ... WHERE email_html IS NOT NULL AND created_at < now()-90d.
// - Cron: 03:00 UTC ogni giorno (fascia notturna, indipendente dal job di invio).
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RETENTION_DAYS = 90;

export const promemoriaScadenzaRetention = inngest.createFunction(
  {
    id: "promemoria-scadenza-retention",
    name: "Promemoria scadenza — retention email_html (90gg)",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async () => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const cutoffIso = cutoff.toISOString();

    const { data, error } = await supabaseAdmin
      .from("promemoria_scadenza_log")
      .update({ email_html: null } as never)
      .lt("created_at", cutoffIso)
      .not("email_html", "is", null)
      .select("id");

    if (error) {
      console.error("[promemoria-retention] update fail:", error.message);
      throw new Error(error.message);
    }
    return {
      ok: true,
      retention_days: RETENTION_DAYS,
      cutoff: cutoffIso,
      rows_cleared: data?.length ?? 0,
    };
  },
);
