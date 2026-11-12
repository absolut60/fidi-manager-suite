import { ruoliEffettivi } from "@/lib/sessione-aal2.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MARKETING_ROLES = ["amministratore", "amministrazione", "direzione", "marketing"] as const;

async function assertRuoloMarketing(
  supabase: { from: (t: string) => any },
  userId: string,
  claims: unknown,
): Promise<void> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const ruoli = ruoliEffettivi(((data ?? []) as Array<{ role: string }>).map((r) => r.role), claims);
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

/** Avvia l'invio reale di una campagna marketing (asincrono via Inngest). */
export const avviaInvioCampagnaMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId, context.claims);

    const { data: camp, error } = await supabase
      .from("campagne_email_marketing")
      .select("id, nome, stato")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (error || !camp) throw new Error("Campagna non trovata");
    if (camp.stato === "in_corso") throw new Error("Invio già in corso per questa campagna");

    const { count } = await supabase
      .from("campagne_email_destinatari")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato_invio", "da_inviare");
    const totale = count ?? 0;
    if (totale === 0) throw new Error("Nessun destinatario da inviare");

    const { error: eUpd } = await supabase
      .from("campagne_email_marketing")
      .update({ operatore_id: userId, note: null } as never)
      .eq("id", data.campagnaId);
    if (eUpd) throw new Error(eUpd.message);

    await inviaEventoInngest("campagna-marketing/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, totale };
  });

/** Annulla un invio in corso: il job si ferma al guard del blocco successivo. */
export const annullaInvioCampagnaMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId, context.claims);
    const { error } = await supabase
      .from("campagne_email_marketing")
      .update({ stato: "annullata" } as never)
      .eq("id", data.campagnaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Rimette in coda i destinatari falliti e riemette l'evento di invio. */
export const riprovaCampagnaMarketingFalliti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId, context.claims);

    const { data: righe, error } = await supabase
      .from("campagne_email_destinatari")
      .select("id")
      .eq("campagna_id", data.campagnaId)
      .eq("stato_invio", "fallito");
    if (error) throw new Error(error.message);
    const ids = ((righe ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return { ok: true, riprovati: 0 };

    const { error: eUpd } = await supabase
      .from("campagne_email_destinatari")
      .update({ stato_invio: "da_inviare", errore: null, inviato_at: null } as never)
      .in("id", ids);
    if (eUpd) throw new Error(eUpd.message);

    await supabase
      .from("campagne_email_marketing")
      .update({ stato: "in_corso", operatore_id: userId, note: null } as never)
      .eq("id", data.campagnaId);

    await inviaEventoInngest("campagna-marketing/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, riprovati: ids.length };
  });

/** Riprende l'invio di una campagna ferma a metà riemettendo l'evento Inngest.
 *  Il job è idempotente: salta i destinatari che non sono più 'da_inviare'.
 */
export const riprendiInvioCampagnaMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId, context.claims);

    const { count, error } = await supabase
      .from("campagne_email_destinatari")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato_invio", "da_inviare");
    if (error) throw new Error(error.message);
    const daInviare = count ?? 0;
    if (daInviare === 0) return { ok: true, riemesso: false, daInviare: 0 };

    // FM37: se l'invio sta ancora procedendo non riemettere l'evento (evita doppi invii).
    const { data: camp, error: eCamp } = await supabase
      .from("campagne_email_marketing")
      .select("stato")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (eCamp) throw new Error(eCamp.message);
    if ((camp as { stato?: string } | null)?.stato === "in_corso") {
      const { data: ultimo, error: eUlt } = await supabase
        .from("campagne_email_destinatari")
        .select("inviato_at")
        .eq("campagna_id", data.campagnaId)
        .not("inviato_at", "is", null)
        .order("inviato_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (eUlt) throw new Error(eUlt.message);
      const at = (ultimo as { inviato_at?: string | null } | null)?.inviato_at;
      if (at && Date.now() - new Date(at).getTime() < 10 * 60_000) {
        throw new Error("L'invio sta ancora procedendo: riprova tra qualche minuto se resta fermo");
      }
    }

    const { error: eUpd } = await supabase
      .from("campagne_email_marketing")
      .update({ stato: "in_corso", operatore_id: userId, note: null } as never)
      .eq("id", data.campagnaId);
    if (eUpd) throw new Error(eUpd.message);

    await inviaEventoInngest("campagna-marketing/invio.requested", { campagna_id: data.campagnaId });
    return { ok: true, riemesso: true, daInviare };
  });
