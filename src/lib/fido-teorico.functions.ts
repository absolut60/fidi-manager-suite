import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Forza il refresh del precalcolo `fatturato_mensile_cliente` (fido teorico).
 * Solo amministratori. Restituisce il timestamp di aggiornamento.
 */
export const refreshFatturatoMensile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("refresh_fatturato_mensile");
    if (error) throw new Error(error.message);
    return { aggiornatoAl: data as unknown as string };
  });
