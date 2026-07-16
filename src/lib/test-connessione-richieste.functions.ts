import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

export const testConnessioneRichieste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const url = process.env.RICHIESTE_SUPABASE_URL;
    const key = process.env.RICHIESTE_SERVICE_KEY;
    const mancanti: string[] = [];
    if (!url || url.trim() === "") mancanti.push("RICHIESTE_SUPABASE_URL");
    if (!key || key.trim() === "") mancanti.push("RICHIESTE_SERVICE_KEY");
    if (mancanti.length > 0) {
      throw new Error(`Secret mancante o vuoto: ${mancanti.join(", ")}`);
    }

    const client = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });

    const result: {
      requestsCount: number | null;
      requestsError: string | null;
      attachmentsCount: number | null;
      attachmentsError: string | null;
      storageFolders: number | null;
      storageEntries: string[] | null;
      storageError: string | null;
    } = {
      requestsCount: null,
      requestsError: null,
      attachmentsCount: null,
      attachmentsError: null,
      storageFolders: null,
      storageEntries: null,
      storageError: null,
    };

    try {
      const { count, error } = await client
        .from("requests")
        .select("*", { count: "exact", head: true });
      if (error) result.requestsError = error.message;
      else result.requestsCount = count ?? 0;
    } catch (e) {
      result.requestsError = e instanceof Error ? e.message : String(e);
    }

    try {
      const { count, error } = await client
        .from("attachments")
        .select("*", { count: "exact", head: true });
      if (error) result.attachmentsError = error.message;
      else result.attachmentsCount = count ?? 0;
    } catch (e) {
      result.attachmentsError = e instanceof Error ? e.message : String(e);
    }

    try {
      const { data, error } = await client.storage
        .from("richieste-allegati")
        .list("", { limit: 1000 });
      if (error) {
        result.storageError = error.message;
      } else {
        const entries = data ?? [];
        // Le "cartelle" in Supabase Storage sono entry con id === null
        const folders = entries.filter((e) => (e as { id: string | null }).id === null);
        result.storageFolders = folders.length;
        result.storageEntries = entries.map((e) => e.name);
      }
    } catch (e) {
      result.storageError = e instanceof Error ? e.message : String(e);
    }

    return result;
  });
