import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Refresh giornaliero del precalcolo `public.fatturato_mensile_cliente`
 * (base del fido teorico). Viene eseguito anche al termine di ogni import
 * scadenziario; questo cron e' la rete di sicurezza quotidiana.
 */
export const refreshFatturatoMensileCron = inngest.createFunction(
  {
    id: "refresh-fatturato-mensile",
    name: "Refresh precalcolo fatturato mensile (fido teorico)",
    retries: 2,
    triggers: [{ cron: "0 4 * * *" }],
  },
  async () => {
    const { data, error } = await supabaseAdmin.rpc("refresh_fatturato_mensile");
    if (error) throw new Error(error.message);
    return { ok: true, aggiornato_al: data };
  },
);
