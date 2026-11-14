import { eliminaConEsito, messaggioEsitoEliminazione } from "@/lib/esito-eliminazione";
import { assertSessioneAal2 } from "@/lib/sessione-aal2.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConfirmSchema = z.object({ conferma: z.string() });
const PHRASE = "AZZERA SCADENZE";

/**
 * Reset distruttivo della tabella scadenze.
 * Riservato ad amministratori. Richiede frase di conferma "AZZERA SCADENZE".
 *
 * Cosa fa:
 *  1) Elimina i reminder con scadenza_id NOT NULL (per evitare orfani).
 *  2) Elimina tutte le scadenze: le righe in azioni_recupero_scadenze cadono
 *     per CASCADE, le azioni_recupero restano (si scollegano dalle scadenze).
 *
 * Gli stadi di sollecito vengono azzerati (decisione consapevole).
 */
export const resetScadenze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConfirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.conferma !== PHRASE) {
      throw new Error(`Conferma errata: devi scrivere esattamente "${PHRASE}".`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica ruolo amministratore (oltre al middleware auth).
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesErr) throw new Error(`Verifica ruolo fallita: ${rolesErr.message}`);
    const isAdmin = (roles ?? []).some((r) => r.role === "amministratore");
    if (!isAdmin) throw new Error("Permesso negato: operazione riservata agli amministratori.");
    assertSessioneAal2(context.claims);

    const conteggi = { scadenze_eliminate: 0, reminder_eliminati: 0, azioni_scadenze_scollegate: 0 };
    const { count: linkPrima, error: eLink } = await supabaseAdmin.from("azioni_recupero_scadenze").select("azione_id", { count: "exact", head: true });
    if (eLink || linkPrima === null) throw new Error(eLink?.message ?? "Conteggio collegamenti non disponibile");
    for (const tabella of ["reminder", "scadenze"] as const) {
      let lettura = supabaseAdmin.from(tabella).select("id", { count: "exact", head: true });
      if (tabella === "reminder") lettura = lettura.not("scadenza_id", "is", null);
      const { count: richiesti, error } = await lettura;
      if (error || richiesti === null) throw new Error(error?.message ?? "Conteggio non disponibile");
      if (!richiesti) continue;
      const esito = await eliminaConEsito(tabella, { richiesti, filtro: q => tabella === "reminder" ? q.not("scadenza_id", "is", null) : q.not("id", "is", null) }, undefined, supabaseAdmin);
      if (esito.tipo !== "eliminato") throw new Error(`${messaggioEsitoEliminazione(esito, tabella === "reminder" ? "i promemoria" : "le scadenze")} Promemoria già eliminati: ${conteggi.reminder_eliminati}.`);
      if (tabella === "reminder") conteggi.reminder_eliminati = esito.eliminati ?? 0;
      else conteggi.scadenze_eliminate = esito.eliminati ?? 0;
    }
    const { count: linkDopo, error: eDopo } = await supabaseAdmin.from("azioni_recupero_scadenze").select("azione_id", { count: "exact", head: true });
    if (eDopo || linkDopo === null) throw new Error(eDopo?.message ?? "Conteggio finale collegamenti non disponibile");
    conteggi.azioni_scadenze_scollegate = Math.max(0, linkPrima - linkDopo);
    return { ok: true, reset: conteggi };
  });
