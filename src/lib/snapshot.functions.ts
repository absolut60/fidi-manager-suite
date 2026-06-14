import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generaSnapshotOggi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const oggi = new Date().toISOString().slice(0, 10);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("genera_snapshot", { _data: oggi });
    if (error) throw new Error(error.message);

    const { data: row } = await supabaseAdmin
      .from("snapshot_scaduto")
      .select("*")
      .eq("data_snapshot", oggi)
      .maybeSingle();

    return { id: data, data_snapshot: oggi, snapshot: row };
  });
