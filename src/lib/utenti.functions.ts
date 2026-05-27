import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const RUOLI_VALIDI = [
  "store_manager",
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "amministratore",
  "amministrazione",
  "direzione",
] as const;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

/** Invita un nuovo utente via email e imposta profilo + ruoli. */
export const inviteUtente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    email: string;
    nome?: string;
    cognome?: string;
    ruoli: string[];
    storeId?: string | null;
    attivo?: boolean;
  }) =>
    z.object({
      email: z.string().email().max(255),
      nome: z.string().max(100).optional(),
      cognome: z.string().max(100).optional(),
      ruoli: z.array(z.enum(RUOLI_VALIDI)).min(1).max(5),
      storeId: z.string().uuid().nullable().optional(),
      attivo: z.boolean().optional().default(true),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.ruoli.includes("store_manager") && !data.storeId) {
      throw new Error("Il ruolo Store Manager richiede un punto vendita");
    }

    // Invita utente — il trigger handle_new_user crea profilo + ruolo default
    const { data: invited, error: eInv } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: {
          nome: data.nome ?? "",
          cognome: data.cognome ?? "",
        },
      }
    );
    if (eInv) throw new Error(eInv.message);
    const userId = invited.user?.id;
    if (!userId) throw new Error("Invito fallito: nessun utente creato");

    // Aggiorna profilo
    const { error: eProf } = await supabaseAdmin
      .from("profili")
      .update({
        nome: data.nome ?? "",
        cognome: data.cognome ?? "",
        store_id: data.storeId ?? null,
        attivo: data.attivo ?? true,
      })
      .eq("id", userId);
    if (eProf) throw new Error(eProf.message);

    // Sostituisci i ruoli con quelli scelti
    const { error: eDel } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    if (eDel) throw new Error(eDel.message);
    const { error: eIns } = await supabaseAdmin
      .from("user_roles")
      .insert(data.ruoli.map((role) => ({ user_id: userId, role: role as AppRole })));
    if (eIns) throw new Error(eIns.message);

    return { ok: true, userId };
  });

/** Aggiorna profilo + ruoli multipli di un utente esistente. */
export const updateUtenteRuoli = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    ruoli: string[];
    storeId?: string | null;
    attivo: boolean;
  }) =>
    z.object({
      userId: z.string().uuid(),
      ruoli: z.array(z.enum(RUOLI_VALIDI)).min(1).max(5),
      storeId: z.string().uuid().nullable().optional(),
      attivo: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.ruoli.includes("store_manager") && !data.storeId) {
      throw new Error("Il ruolo Store Manager richiede un punto vendita");
    }

    const { error: eProf } = await supabaseAdmin
      .from("profili")
      .update({ store_id: data.storeId ?? null, attivo: data.attivo })
      .eq("id", data.userId);
    if (eProf) throw new Error(eProf.message);

    const { error: eDel } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (eDel) throw new Error(eDel.message);
    const { error: eIns } = await supabaseAdmin
      .from("user_roles")
      .insert(data.ruoli.map((role) => ({ user_id: data.userId, role: role as AppRole })));
    if (eIns) throw new Error(eIns.message);

    return { ok: true };
  });
