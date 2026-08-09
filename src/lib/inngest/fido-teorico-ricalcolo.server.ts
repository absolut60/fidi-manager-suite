import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Ricalcolo del precalcolo persistente del fido teorico
 * (public.fido_teorico_cliente). Gira in background con service_role
 * (nessuno statement_timeout di 8s) e si limita a chiamare la RPC canonica.
 */
export const ricalcolaFidoTeoricoJob = inngest.createFunction(
  {
    id: "ricalcola-fido-teorico",
    name: "Ricalcolo precalcolo fido teorico",
    retries: 2,
    triggers: [{ event: "fido-teorico/ricalcolo.requested" }],
  },
  async () => {
    const { data, error } = await supabaseAdmin.rpc("ricalcola_fido_teorico");
    if (error) throw new Error(error.message);
    return { ok: true, ricalcolato_al: data };
  },
);
