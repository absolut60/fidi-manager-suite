import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MARKETING_ROLES = ["amministratore", "amministrazione", "direzione", "marketing"] as const;

async function assertRuoloMarketing(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const ruoli = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!ruoli.some((r) => (MARKETING_ROLES as readonly string[]).includes(r))) {
    throw new Error("Non autorizzato: servono i permessi Marketing");
  }
}

// Unica implementazione HTTP dell'emissione eventi: sendInngestEvent in
// src/lib/inngest/client.ts (import dinamico: quel modulo resta server-only).
async function inviaEventoInngest(name: string, data: Record<string, unknown>): Promise<void> {
  const { sendInngestEvent } = await import("@/lib/inngest/client");
  await sendInngestEvent(name, data);
}

/** Avvia l'invio reale di una campagna WhatsApp (asincrono via Inngest). */
export const avviaInvioCampagnaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId);

    const { data: camp, error } = await supabase
      .from("campagne_whatsapp")
      .select("id, nome, stato, template_id")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (error || !camp) throw new Error("Campagna non trovata");
    if (camp.stato === "in_corso") throw new Error("Invio già in corso per questa campagna");
    if (camp.stato !== "pronta") throw new Error("La campagna deve essere in stato Pronta prima dell'invio");
    if (!camp.template_id) throw new Error("Nessun template collegato alla campagna");

    const { data: tpl, error: eTpl } = await supabase
      .from("whatsapp_template")
      .select("stato")
      .eq("id", camp.template_id)
      .maybeSingle();
    if (eTpl) throw new Error(eTpl.message);
    if (tpl?.stato !== "approvato") throw new Error("Il template collegato non è approvato");

    const { count } = await supabase
      .from("messaggi_whatsapp")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "in_coda");
    const totale = count ?? 0;
    if (totale === 0) throw new Error("Nessun destinatario da inviare");

    await inviaEventoInngest("campagna-whatsapp/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, totale };
  });

/** Riprende l'invio di una campagna ferma a metà riemettendo l'evento Inngest.
 *  Il job è idempotente: salta i destinatari che non sono più 'in_coda'.
 */
export const riprendiInvioCampagnaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId);

    const { count, error } = await supabase
      .from("messaggi_whatsapp")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "in_coda");
    if (error) throw new Error(error.message);
    const daInviare = count ?? 0;
    if (daInviare === 0) return { ok: true, riemesso: false, daInviare: 0 };

    const { error: eUpd } = await supabase
      .from("campagne_whatsapp")
      .update({ stato: "in_corso" } as never)
      .eq("id", data.campagnaId);
    if (eUpd) throw new Error(eUpd.message);

    await inviaEventoInngest("campagna-whatsapp/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, riemesso: true, daInviare };
  });

/** Rimette in coda i destinatari falliti di una campagna e rilancia l'invio
 *  (il job è idempotente: salta i destinatari che non sono più 'in_coda').
 */
export const reinviaFallitiCampagnaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId);

    const { count, error: eSel } = await supabase
      .from("messaggi_whatsapp")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "fallito");
    if (eSel) throw new Error(eSel.message);
    const falliti = count ?? 0;
    if (falliti === 0) return { ok: true, riemesso: false, falliti: 0 };

    const { error: eUpdMsg } = await supabase
      .from("messaggi_whatsapp")
      .update({ stato: "in_coda", errore: null } as never)
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "fallito");
    if (eUpdMsg) throw new Error(eUpdMsg.message);

    const { error: eUpdCamp } = await supabase
      .from("campagne_whatsapp")
      .update({ stato: "in_corso" } as never)
      .eq("id", data.campagnaId);
    if (eUpdCamp) throw new Error(eUpdCamp.message);

    await inviaEventoInngest("campagna-whatsapp/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, riemesso: true, falliti };
  });
