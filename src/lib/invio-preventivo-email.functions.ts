// Invio del preventivo via email (fetta 1: solo motore, nessuna UI la chiama ancora).
// Gate: public.auth_puo_scrivere_preventivo_id (gemello TS puoScriverePreventivi): la consultazione non invia.
// Testata e piede dalla SEDE DEL PREVENTIVO (preventivi.store_id), ripiego MADE; Reply-To dell'operatore.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sedeEmailDaStoreId } from "@/lib/branding-email";
import { sendEmailViaEdge } from "@/lib/inngest/send-email.server";
import { nomeIntestatarioPdf } from "@/lib/soggetto-preventivo";
import { costruisciEmailPreventivo, inputInvioPreventivo, isPdfBytes, MAX_PDF_PREVENTIVO_BYTES } from "@/lib/invio-preventivo-email-core";

export const inviaEmailPreventivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = inputInvioPreventivo.safeParse(data);
    if (!r.success) throw new Error(r.error.issues.map(i => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: puo, error: eGate } = await supabase.rpc("auth_puo_scrivere_preventivo_id", { _preventivo_id: data.preventivoId });
    if (eGate) throw new Error(`Verifica permessi fallita: ${eGate.message}`);
    if (!puo) throw new Error("Non hai i permessi per inviare questo preventivo.");

    const { data: prev, error: ePrev } = await supabase
      .from("preventivi")
      .select("id, numero, titolo, validita, totale, store_id, cliente_id, lead:lead!preventivi_lead_id_fkey(ragione_sociale,nome,cognome)")
      .eq("id", data.preventivoId).maybeSingle();
    if (ePrev) throw new Error(`Lettura preventivo fallita: ${ePrev.message}`);
    if (!prev) throw new Error("Preventivo non trovato");

    // Nome cliente dalla stessa RPC del preventivatore (i preventivisti non leggono la tabella clienti).
    let cliente: { ragione_sociale: string | null } | null = null;
    if (prev.cliente_id) {
      const { data: dc, error: eCli } = await supabase.rpc("dati_cliente_preventivo", { _id: prev.cliente_id });
      if (eCli) throw new Error(`Lettura cliente fallita: ${eCli.message}`);
      cliente = { ragione_sociale: dc?.[0]?.ragione_sociale ?? null };
    }

    let bytes: Uint8Array;
    try { const bin = atob(data.pdf.base64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    catch { throw new Error("Il PDF del preventivo non è leggibile."); }
    if (!isPdfBytes(bytes)) throw new Error("Il file allegato non è un PDF valido.");
    if (bytes.byteLength > MAX_PDF_PREVENTIVO_BYTES) throw new Error("Il PDF supera il limite di 10 MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sede, inlineLogoBase64 } = await sedeEmailDaStoreId(prev.store_id, supabase, supabaseAdmin, "invio");

    const { data: prof } = await supabase.from("profili").select("nome, cognome, email").eq("id", userId).maybeSingle();
    const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "Operatore";
    const claimEmail = (context.claims as { email?: string } | undefined)?.email ?? null;
    const emailOperatore = prof?.email?.trim() || claimEmail || null;

    const email = costruisciEmailPreventivo({
      oggetto: data.oggetto, corpo: data.corpo,
      ragioneSociale: nomeIntestatarioPdf({ cliente, lead: prev.lead }),
      preventivo: { numero: prev.numero, titolo: prev.titolo, validita: prev.validita, totale_ivato: prev.totale == null ? null : Number(prev.totale), sede: sede?.nome ?? null },
      sede, mittente: { nome: nomeOperatore, email: emailOperatore },
    });

    const [primo, ...altri] = data.to.map(e => e.trim());
    const esito = await sendEmailViaEdge({
      to: primo,
      cc: [...altri, ...data.cc.map(e => e.trim())],
      bcc: data.bcc.map(e => e.trim()),
      subject: email.oggetto,
      html: email.htmlInvio,
      fromName: "MADE Distribuzione",
      replyTo: emailOperatore ?? undefined,
      inlineLogo: true,
      ...(inlineLogoBase64 ? { inlineLogoBase64 } : {}),
      attachments: [{ filename: data.pdf.filename, content: data.pdf.base64, contentType: "application/pdf" }],
    });
    if (!esito.ok) throw new Error(`Invio fallito: ${esito.err ?? "errore sconosciuto"}`);
    return { ok: true as const, messageId: esito.messageId ?? null, oggetto: email.oggetto, htmlArchivio: email.htmlArchivio };
  });
