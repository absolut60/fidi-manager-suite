import { leggiTutteLeRighe } from "@/lib/leggi-tutte-le-righe";
import { eliminaConEsito, messaggioEsitoEliminazione } from "@/lib/esito-eliminazione";
import { assertSessioneAal2 } from "@/lib/sessione-aal2.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONFIRM_PHRASE = "ELIMINA TUTTO";

async function assertAdmin(supabase: any, userId: string, claims: unknown) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
  assertSessioneAal2(claims);
}

/** Conta cosa verrebbe eliminato dalla pulizia recupero. */
export const getCleanupRecuperoCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, context.claims);
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
    await assertAdmin(supabase, userId, context.claims);
    if (data.conferma !== CONFIRM_PHRASE) {
      throw new Error(`Frase di conferma errata. Devi digitare esattamente: ${CONFIRM_PHRASE}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conteggi = { azioni_eliminate: 0, campagne_eliminate: 0, destinatari_eliminati: 0, allegati_eliminati: 0, file_rimossi: 0 };
    const alleg = await leggiTutteLeRighe<{ id: string; storage_path: string }>((da, a) => supabaseAdmin.from("allegati").select("id, storage_path").eq("entita_tipo", "azione_recupero").order("id").range(da, a));
    if (alleg.length) {
      const esito = await eliminaConEsito("allegati", { richiesti: alleg.length, filtro: q => q.eq("entita_tipo", "azione_recupero") }, undefined, supabaseAdmin);
      if (esito.tipo !== "eliminato") throw new Error(messaggioEsitoEliminazione(esito, "gli allegati delle azioni"));
      conteggi.allegati_eliminati = esito.eliminati ?? 0;
      const paths = alleg.map(a => a.storage_path).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) {
        const { data: rimossi, error } = await supabaseAdmin.storage.from("allegati").remove(paths.slice(i, i + 100));
        if (!error) conteggi.file_rimossi += rimossi?.length ?? 0;
      }
    }
    for (const [tabella, campo] of [["azioni_recupero", "azioni_eliminate"], ["campagne_sollecito_destinatari", "destinatari_eliminati"], ["campagne_sollecito", "campagne_eliminate"]] as const) {
      const { count: richiesti, error } = await supabaseAdmin.from(tabella).select("id", { count: "exact", head: true });
      if (error || richiesti === null) throw new Error(error?.message ?? "Conteggio non disponibile");
      if (!richiesti) continue;
      const esito = await eliminaConEsito(tabella, { richiesti, filtro: q => q.not("id", "is", null) }, undefined, supabaseAdmin);
      if (esito.tipo !== "eliminato") throw new Error(`${messaggioEsitoEliminazione(esito, tabella === "azioni_recupero" ? "le azioni" : tabella === "campagne_sollecito" ? "le campagne" : "i destinatari")} Già eliminati: ${conteggi.allegati_eliminati} allegati, ${conteggi.azioni_eliminate} azioni, ${conteggi.destinatari_eliminati} destinatari, ${conteggi.campagne_eliminate} campagne.`);
      conteggi[campo] = esito.eliminati ?? 0;
    }
    return conteggi;
  });
