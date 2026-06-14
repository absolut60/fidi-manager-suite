import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cron mensile: primo del mese alle 02:00 -> genera snapshot per oggi
export const snapshotMensile = inngest.createFunction(
  {
    id: "snapshot-mensile-scaduto",
    name: "Snapshot mensile scaduto",
    triggers: [{ cron: "0 2 1 * *" }],
  },
  async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin.rpc("genera_snapshot", { _data: oggi });
    if (error) throw new Error(error.message);
    return { ok: true, id: data, data_snapshot: oggi };
  },
);
