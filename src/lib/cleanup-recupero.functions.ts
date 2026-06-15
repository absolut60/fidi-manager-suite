import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONFIRM_PHRASE = "ELIMINA TUTTO";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

/** Conta cosa verrebbe eliminato dalla pulizia recupero. */
export const getCleanupRecuperoCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [azR, camR, camDR, allR, linkR] = await Promise.all([
      supabaseAdmin.from("azioni_recupero").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("campagne_sollecito").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("campagne_sollecito_destinatari").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("allegati").select("id", { count: "exact", head: true }).eq("entita_tipo", "azione_recupero"),
      supabaseAdmin.from("azioni_recupero_scadenze").select("azione_id", { count: "exact", head: true }),
    ]);
    return {
      azioni: azR.count ?? 0,
      campagne: camR.count ?? 0,
      destinatari: camDR.count ?? 0,
      allegati: allR.count ?? 0,
      collegamenti_scadenze: linkR.count ?? 0,
    };
  });

/** ESEGUE la pulizia di massa. SOLO ADMIN. Richiede frase di conferma esatta. */
export const eseguiCleanupRecupero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conferma: string }) =>
    z.object({ conferma: z.string() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.conferma !== CONFIRM_PHRASE) {
      throw new Error(`Frase di conferma errata. Devi digitare esattamente: ${CONFIRM_PHRASE}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Allegati azioni: raccogli path e cancella file dal bucket
    const { data: alleg, error: eAll } = await supabaseAdmin
      .from("allegati")
      .select("id, storage_path")
      .eq("entita_tipo", "azione_recupero");
    if (eAll) throw new Error(eAll.message);

    const allegatiCount = alleg?.length ?? 0;
    const paths = (alleg ?? []).map((a: any) => a.storage_path).filter(Boolean);
    let fileRimossi = 0;
    if (paths.length > 0) {
      // batch di 100 per evitare payload eccessivi
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { error } = await supabaseAdmin.storage.from("allegati").remove(batch);
        if (!error) fileRimossi += batch.length;
      }
      const { error: eDelAll } = await supabaseAdmin
        .from("allegati")
        .delete()
        .eq("entita_tipo", "azione_recupero");
      if (eDelAll) throw new Error(eDelAll.message);
    }

    // 2) Conta + cancella azioni (azioni_recupero_scadenze CASCADE)
    const { count: azioniCount } = await supabaseAdmin
      .from("azioni_recupero")
      .select("id", { count: "exact", head: true });
    const { error: eAz } = await supabaseAdmin
      .from("azioni_recupero")
      .delete()
      .not("id", "is", null);
    if (eAz) throw new Error(eAz.message);

    // 3) Campagne (destinatari prima per sicurezza)
    const { count: destCount } = await supabaseAdmin
      .from("campagne_sollecito_destinatari")
      .select("id", { count: "exact", head: true });
    const { error: eDest } = await supabaseAdmin
      .from("campagne_sollecito_destinatari")
      .delete()
      .not("id", "is", null);
    if (eDest) throw new Error(eDest.message);

    const { count: campCount } = await supabaseAdmin
      .from("campagne_sollecito")
      .select("id", { count: "exact", head: true });
    const { error: eCamp } = await supabaseAdmin
      .from("campagne_sollecito")
      .delete()
      .not("id", "is", null);
    if (eCamp) throw new Error(eCamp.message);

    return {
      azioni_eliminate: azioniCount ?? 0,
      campagne_eliminate: campCount ?? 0,
      destinatari_eliminati: destCount ?? 0,
      allegati_eliminati: allegatiCount,
      file_rimossi: fileRimossi,
    };
  });
