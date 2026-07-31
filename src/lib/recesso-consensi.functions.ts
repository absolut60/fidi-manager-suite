import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONSENSO_LABEL, type TipoConsenso } from "./consensi-testi";

function estraiIp(): string | null {
  try {
    const h = getRequest().headers;
    const raw =
      h.get("cf-connecting-ip") ??
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    return raw ? raw.slice(0, 100) : null;
  } catch {
    return null;
  }
}

/**
 * Genera (o restituisce, se già presente) il token di recesso duraturo del
 * contatto. Idempotente e SENZA scadenza: il link finirà in ogni email marketing.
 */
export const generaTokenRecesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contattoId: string }) =>
    z.object({ contattoId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ct, error } = await supabase
      .from("contatti")
      .select("id, recesso_token")
      .eq("id", data.contattoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Contatto non trovato o non accessibile");
    if (ct.recesso_token) return { token: ct.recesso_token };

    const token = crypto.randomUUID();
    const { error: eUpd } = await supabaseAdmin
      .from("contatti")
      .update({ recesso_token: token })
      .eq("id", data.contattoId);
    if (eUpd) throw new Error(eUpd.message);
    return { token };
  });

/**
 * Dati pubblici per la pagina di recesso: cliente, firmatario e stato attuale
 * dei tre consensi. Nessun login richiesto, nessuna scadenza sul token.
 */
export const getContattoPerRecesso = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select(
        "id, cliente_id, nome, cognome, email, consenso_profilazione, consenso_marketing_media, consenso_marketing_diretto"
      )
      .eq("recesso_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");

    const { data: cli } = await supabaseAdmin
      .from("clienti")
      .select("ragione_sociale, partita_iva, indirizzo, citta")
      .eq("id", ct.cliente_id)
      .maybeSingle();

    return {
      contatto: {
        id: ct.id,
        nome: ct.nome,
        cognome: ct.cognome,
        email: ct.email,
      },
      cliente: {
        ragione_sociale: cli?.ragione_sociale ?? "",
        partita_iva: cli?.partita_iva ?? null,
        indirizzo: cli?.indirizzo ?? null,
        citta: cli?.citta ?? null,
      },
      statoAttuale: {
        profilazione: !!ct.consenso_profilazione,
        marketing_media: !!ct.consenso_marketing_media,
        marketing_diretto: !!ct.consenso_marketing_diretto,
      },
    };
  });

const revocaSchema = z.object({
  token: z.string().uuid(),
  consensiDaRevocare: z.object({
    marketing_diretto: z.boolean(),
    marketing_media: z.boolean(),
    profilazione: z.boolean(),
  }),
});

/**
 * Revoca (in un'unica transazione SQL) i consensi indicati e notifica
 * l'amministrazione via email. Ogni revoca passa da registra_consenso.
 */
export const revocaConsensi = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof revocaSchema>) => revocaSchema.parse(d))
  .handler(async ({ data }) => {
    const ip = estraiIp();
    const scelte = data.consensiDaRevocare;
    const tipi = (Object.keys(scelte) as TipoConsenso[]).filter((k) => scelte[k]);
    if (tipi.length === 0) throw new Error("Nessun consenso selezionato");

    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, nome, cognome, email")
      .eq("recesso_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");

    const { error: eRev } = await supabaseAdmin.rpc("revoca_consensi_batch", {
      _contatto_id: ct.id,
      _marketing_diretto: scelte.marketing_diretto,
      _marketing_media: scelte.marketing_media,
      _profilazione: scelte.profilazione,
      _origine: "recesso_link",
      ...(ip ? { _ip: ip } : {}),
      _note: "Revoca richiesta dall'interessato via link pubblico di recesso",
    });
    if (eRev) throw new Error(`revoca_consensi_batch: ${eRev.message}`);

    // Notifica amministrazione (non blocca la revoca in caso di errore invio)
    try {
      const { data: cli } = await supabaseAdmin
        .from("clienti")
        .select("ragione_sociale")
        .eq("id", ct.cliente_id)
        .maybeSingle();

      const conf = async (chiave: string) => {
        const { data: r } = await supabaseAdmin
          .from("configurazioni")
          .select("valore")
          .eq("chiave", chiave)
          .maybeSingle();
        return (r?.valore ?? "").toString().trim();
      };
      const dest =
        (await conf("consensi_recesso_email_notifica")) ||
        (await conf("piano_rientro_email_amministrazione"));

      if (dest) {
        const { sendEmailViaEdge } = await import("./inngest/send-email.server");
        const quando = new Date().toLocaleString("it-IT");
        const nome = [ct.nome, ct.cognome].filter(Boolean).join(" ");
        const lista = tipi.map((t) => `<li>${CONSENSO_LABEL[t]}</li>`).join("");
        await sendEmailViaEdge({
          to: dest,
          subject: `Revoca consensi marketing — ${cli?.ragione_sociale ?? ""}`,
          fromName: "FidiManager",
          html: `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
<div style="max-width:640px;margin:0 auto;padding:16px 20px;">
<h2 style="font-size:18px;">Revoca consensi marketing</h2>
<p>Un interessato ha revocato uno o più consensi tramite il link pubblico di recesso.</p>
<ul>
  <li><strong>Cliente:</strong> ${cli?.ragione_sociale ?? "—"}</li>
  <li><strong>Contatto:</strong> ${nome || "—"}${ct.email ? ` (${ct.email})` : ""}</li>
  <li><strong>Data/ora:</strong> ${quando}</li>
</ul>
<p><strong>Consensi revocati:</strong></p>
<ul>${lista}</ul>
</div></body></html>`,
        });
      }
    } catch (e) {
      console.error("[recesso] notifica email fallita", e);
    }

    return { ok: true, revocati: tipi };
  });
