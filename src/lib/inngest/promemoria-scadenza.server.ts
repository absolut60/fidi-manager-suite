// Job giornaliero: promemoria automatico scadenze in arrivo.
// - Cron: 06:00 UTC ogni giorno.
// - Trova scadenze aperte con data_scadenza = today + N giorni (N = config),
//   metodo di pagamento con prefisso configurato (default 'BO'), non ancora
//   sollecitate e senza promemoria già inviato.
// - Raggruppa per cliente, invia UNA email con la lista scadenze.
// - Idempotente: marca `scadenze.promemoria_scadenza_inviato_il` = now().
// - Rispetta il flag `promemoria_scadenza_attivo`.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";

async function getConfig(chiave: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  return (data?.valore ?? "").toString().trim() || fallback;
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}
function fmtDateIt(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => (String(k).toLowerCase() in vars ? vars[String(k).toLowerCase()] : ""));
}
function wrapHtml(inner: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
<div style="max-width:640px;margin:0 auto;padding:16px 20px;">
${inner}
<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;" />
<p style="font-size:11px;color:#64748b;margin-top:12px;">Email generata automaticamente da FidiManager.</p>
</div></body></html>`;
}

type ScadenzaRow = {
  id: string;
  cliente_id: string;
  numero_documento: string | null;
  data_scadenza: string;
  importo_scadenza: number;
  codice_pagamento: string | null;
  cliente: { ragione_sociale: string | null; email: string | null } | null;
};

export const promemoriaScadenzaAutomatico = inngest.createFunction(
  {
    id: "promemoria-scadenza-automatico",
    name: "Promemoria scadenza automatico",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async () => {
    const attivo = await getConfig("promemoria_scadenza_attivo", "true");
    if (attivo !== "true") {
      return { ok: true, skipped: true, reason: "disattivato" };
    }

    const giorniStr = await getConfig("promemoria_scadenza_giorni_anticipo", "3");
    const giorni = Math.max(0, parseInt(giorniStr, 10) || 3);
    const metodiCsv = await getConfig("promemoria_scadenza_metodi", "BO");
    const prefissi = metodiCsv.split(",").map((s) => s.trim()).filter(Boolean);
    if (prefissi.length === 0) {
      return { ok: true, skipped: true, reason: "nessun_metodo_configurato" };
    }

    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + giorni);
    const targetISO = target.toISOString().slice(0, 10);

    // Template
    const { data: tplRaw } = await supabaseAdmin
      .from("template_email")
      .select("oggetto, corpo")
      .eq("tipo", "promemoria_scadenza")
      .eq("attivo", true)
      .maybeSingle();
    const tpl = tplRaw as { oggetto: string | null; corpo: string | null } | null;
    if (!tpl) return { ok: true, skipped: true, reason: "template_non_trovato" };

    // Filtro codice_pagamento: OR di ilike per ciascun prefisso
    const orExpr = prefissi.map((p) => `codice_pagamento.ilike.${p}%`).join(",");

    const { data: rows, error } = await supabaseAdmin
      .from("scadenze")
      .select("id, cliente_id, numero_documento, data_scadenza, importo_scadenza, codice_pagamento, cliente:clienti(ragione_sociale, email)")
      .eq("stato_contabile", "Aperta")
      .is("data_pagamento_effettiva", null)
      .gt("importo_scadenza", 0)
      .eq("data_scadenza", targetISO)
      .is("promemoria_scadenza_inviato_il", null)
      .or("sollecitato.is.null,sollecitato.eq.false")
      .or(orExpr);
    if (error) throw new Error(error.message);

    const scadenze = (rows ?? []) as unknown as ScadenzaRow[];

    // Raggruppa per cliente
    const perCliente = new Map<string, ScadenzaRow[]>();
    for (const s of scadenze) {
      const arr = perCliente.get(s.cliente_id) ?? [];
      arr.push(s);
      perCliente.set(s.cliente_id, arr);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    let inviati = 0, saltati_no_email = 0, falliti = 0;

    for (const [clienteId, lista] of perCliente) {
      const cliente = lista[0].cliente;
      const ragioneSociale = cliente?.ragione_sociale ?? "Cliente";
      const email = (cliente?.email ?? "").trim();
      const importoTotale = lista.reduce((acc, r) => acc + Number(r.importo_scadenza || 0), 0);
      const numScadenze = lista.length;

      if (!email) {
        await supabaseAdmin.from("promemoria_scadenza_log" as never).insert({
          cliente_id: clienteId,
          email_destinatario: null,
          data_esecuzione: todayISO,
          giorni_anticipo: giorni,
          num_scadenze: numScadenze,
          importo_totale: importoTotale,
          esito: "saltato_no_email",
        } as never);
        saltati_no_email++;
        continue;
      }

      // Costruisci elenco HTML scadenze
      const righeHtml = lista
        .map((r) => {
          const num = escapeHtml(r.numero_documento ?? "—");
          const dt = escapeHtml(fmtDateIt(r.data_scadenza));
          const imp = escapeHtml(fmtEuro(Number(r.importo_scadenza || 0)));
          return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${num}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${dt}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${imp}</td></tr>`;
        })
        .join("");
      const elencoScadenze = `<table style="width:100%;border-collapse:collapse;margin:12px 0;">
<thead><tr style="background:#f1f5f9;"><th style="padding:6px 12px;text-align:left;">Documento</th><th style="padding:6px 12px;text-align:left;">Scadenza</th><th style="padding:6px 12px;text-align:right;">Importo</th></tr></thead>
<tbody>${righeHtml}</tbody>
<tfoot><tr><td colspan="2" style="padding:6px 12px;text-align:right;font-weight:600;">Totale</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${escapeHtml(fmtEuro(importoTotale))}</td></tr></tfoot>
</table>`;

      const vars: Record<string, string> = {
        ragione_sociale: escapeHtml(ragioneSociale),
        elenco_scadenze: elencoScadenze,
      };
      const oggetto = fillTemplate(tpl.oggetto ?? "", vars);
      const corpo = fillTemplate(tpl.corpo ?? "", vars);
      const html = wrapHtml(corpo);

      const res = await sendEmailViaEdge({ to: email, subject: oggetto, html });
      if (res.ok) {
        const { data: logRow, error: logErr } = await supabaseAdmin
          .from("promemoria_scadenza_log" as never)
          .insert({
            cliente_id: clienteId,
            email_destinatario: email,
            data_esecuzione: todayISO,
            giorni_anticipo: giorni,
            num_scadenze: numScadenze,
            importo_totale: importoTotale,
            esito: "inviato",
          } as never)
          .select("id")
          .single();
        if (!logErr && logRow) {
          const logId = (logRow as { id: string }).id;
          const bridgeRows = lista.map((r) => ({ log_id: logId, scadenza_id: r.id }));
          await supabaseAdmin.from("promemoria_scadenza_log_scadenze" as never).insert(bridgeRows as never);
        }
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("scadenze")
          .update({ promemoria_scadenza_inviato_il: nowIso } as never)
          .in("id", lista.map((r) => r.id));
        inviati++;
      } else {
        await supabaseAdmin.from("promemoria_scadenza_log" as never).insert({
          cliente_id: clienteId,
          email_destinatario: email,
          data_esecuzione: todayISO,
          giorni_anticipo: giorni,
          num_scadenze: numScadenze,
          importo_totale: importoTotale,
          esito: "fallito",
          errore: res.err ?? null,
        } as never);
        falliti++;
        console.error(`[promemoria-scadenza] fail cliente ${clienteId}:`, res.err);
      }
    }

    return {
      ok: true,
      target_date: targetISO,
      giorni_anticipo: giorni,
      metodi: prefissi,
      clienti_candidati: perCliente.size,
      inviati,
      saltati_no_email,
      falliti,
    };
  },
);
