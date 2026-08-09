import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Innesca il ricalcolo del precalcolo persistente del fido teorico
 * (public.fido_teorico_cliente). Non duplica la logica: la funzione SQL
 * chiama a blocchi la RPC canonica public.get_fido_teorico.
 * Consentito ad amministratori e direzione (controllo lato SQL).
 */
export const ricalcolaFidoTeorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (supabase as any).rpc("ricalcola_fido_teorico");
    if (error) throw new Error(error.message);
    return { ricalcolatoAl: data as unknown as string };
  });
