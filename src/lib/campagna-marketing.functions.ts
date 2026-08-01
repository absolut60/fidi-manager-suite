import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MARKETING_ROLES = ["amministratore", "amministrazione", "direzione"] as const;

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

async function inviaEventoInngest(name: string, data: Record<string, unknown>): Promise<void> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
  if (!LOVABLE_API_KEY || !INNGEST_API_KEY) throw new Error("Inngest non configurato");
  const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": INNGEST_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Trigger Inngest fallito [${res.status}]: ${txt.slice(0, 200)}`);
  }
}

/** Avvia l'invio reale di una campagna marketing (asincrono via Inngest). */
export const avviaInvioCampagnaMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campagnaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId);

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
    await assertRuoloMarketing(supabase, userId);
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
    await assertRuoloMarketing(supabase, userId);

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



/** Invio di prova: stessa pipeline dell'invio reale, nessuna scrittura di stato. */
export const inviaEmailProvaCampagna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ campagnaId: z.string().uuid(), destinatario: z.string().email() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRuoloMarketing(supabase, userId);

    const { data: camp, error } = await supabase
      .from("campagne_email_marketing")
      .select("id, nome, oggetto, corpo_html")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (error || !camp) throw new Error("Campagna non trovata");

    const { data: prof } = await supabase
      .from("profili")
      .select("nome, cognome, email")
      .eq("id", userId)
      .maybeSingle();
    const nomeOp = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "Ufficio Marketing MADE";

    const { buildEmailCampagna, DATI_ESEMPIO } = await import("@/lib/campagna-marketing-email");
    const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
    const { oggetto, html } = buildEmailCampagna({
      oggetto: camp.oggetto as string,
      corpo: camp.corpo_html as string,
      dati: DATI_ESEMPIO,
      sede: null,
      mittente: { nome: nomeOp, email: prof?.email ?? null },
      linkRecesso: `${appUrl}/recesso/00000000-0000-0000-0000-000000000000`,
      useCid: true,
    });

    // Allegati della campagna, come nell'invio reale.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: alleg } = await supabaseAdmin
      .from("allegati")
      .select("nome_file, storage_path, mime_type")
      .eq("entita_tipo", "campagna_email")
      .eq("entita_id", data.campagnaId);
    const attachments: { filename: string; content: string; contentType: string }[] = [];
    for (const a of alleg ?? []) {
      const { data: file } = await supabaseAdmin.storage
        .from("allegati")
        .download(a.storage_path as string);
      if (!file) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
      attachments.push({
        filename: (a.nome_file as string) ?? "allegato",
        content: btoa(bin),
        contentType: (a.mime_type as string) ?? "application/octet-stream",
      });
    }

    const { sendEmailViaEdge } = await import("@/lib/inngest/send-email.server");
    const res = await sendEmailViaEdge({
      to: data.destinatario,
      subject: `[PROVA] ${oggetto}`,
      html,
      fromName: "MADE Distribuzione",
      replyTo: prof?.email ?? undefined,
      inlineLogo: true,
      ...(attachments.length ? { attachments } : {}),
    });
    if (!res.ok) throw new Error(res.err ?? "Invio email di prova fallito");
    return { ok: true };
  });
