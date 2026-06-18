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

    // Conta righe prima del reset (riepilogo all'utente)
    const [{ count: nScadenze }, { count: nReminder }, { count: nAzioniLink }] = await Promise.all([
      supabaseAdmin.from("scadenze").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("reminder")
        .select("id", { count: "exact", head: true })
        .not("scadenza_id", "is", null),
      supabaseAdmin
        .from("azioni_recupero_scadenze")
        .select("azione_id", { count: "exact", head: true }),
    ]);

    // 1) Elimina reminder collegati a scadenze
    {
      const { error } = await supabaseAdmin
        .from("reminder")
        .delete()
        .not("scadenza_id", "is", null);
      if (error) throw new Error(`Delete reminder fallito: ${error.message}`);
    }

    // 2) Svuota scadenze (cascade su azioni_recupero_scadenze)
    {
      const { error } = await supabaseAdmin
        .from("scadenze")
        .delete()
        .not("id", "is", null);
      if (error) throw new Error(`Svuotamento scadenze fallito: ${error.message}`);
    }

    return {
      ok: true,
      reset: {
        scadenze_eliminate: nScadenze ?? 0,
        reminder_eliminati: nReminder ?? 0,
        azioni_scadenze_scollegate: nAzioniLink ?? 0,
      },
    };
  });
