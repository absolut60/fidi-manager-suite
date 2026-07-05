// Job giornaliero: invia email reminder rate del piano di rientro.
// - Cron: 06:00 UTC ogni giorno.
// - Trova rate 'da_pagare' con data_rata = today + N giorni (N = config) e
//   `reminder_inviato_il IS NULL`.
// - Rende il template `reminder_rata_piano`, invia all'indirizzo config
//   `piano_rientro_email_amministrazione`, e marca `reminder_inviato_il = now()`.
// - Idempotente: un secondo run non reinvia.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getConfig(chiave: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  return (data?.valore ?? "").toString().trim() || fallback;
}

async function sendEmailViaEdge(payload: { to: string; subject: string; html: string }): Promise<{ ok: boolean; err?: string }> {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, err: `HTTP ${res.status}: ${txt.slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
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
// Sostituzione semplice {{key}} — rimpiazza solo le variabili passate.
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

type RataRow = {
  id: string; piano_id: string; numero_rata: number; data_rata: string; importo: number;
  piano: {
    id: string; livello: number; cliente_id: string; stato: string;
    cliente: { ragione_sociale: string };
  };
};

export const remindRatePianoRientro = inngest.createFunction(
  {
    id: "piano-rientro-reminder-rate",
    name: "Reminder rate piano di rientro",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async () => {
    const giorniStr = await getConfig("piano_rientro_giorni_anticipo_reminder", "3");
    const giorni = Math.max(0, parseInt(giorniStr, 10) || 3);
    const emailAmm = await getConfig("piano_rientro_email_amministrazione", "");
    if (!emailAmm) {
      return { ok: false, reason: "email_amministrazione_non_configurata" };
    }

    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + giorni);
    const targetISO = target.toISOString().slice(0, 10);

    const { data: rate, error } = await supabaseAdmin
      .from("piani_rientro_rate" as never)
      .select("id, piano_id, numero_rata, data_rata, importo, piano:piani_rientro(id, livello, cliente_id, stato, cliente:clienti(ragione_sociale))")
      .eq("stato", "da_pagare")
      .is("reminder_inviato_il", null)
      .eq("data_rata", targetISO);
    if (error) throw new Error(error.message);

    const rows = (rate ?? []) as unknown as RataRow[];
    const attive = rows.filter((r) => r.piano?.stato === "attivo");

    const { data: tplRaw } = await supabaseAdmin
      .from("template_email")
      .select("oggetto, corpo")
      .eq("tipo", "reminder_rata_piano")
      .eq("attivo", true)
      .maybeSingle();
    const tpl = tplRaw as { oggetto: string | null; corpo: string | null } | null;
    if (!tpl) return { ok: false, reason: "template_reminder_non_trovato" };

    let inviate = 0, fallite = 0;
    for (const r of attive) {
      const vars: Record<string, string> = {
        ragione_sociale: escapeHtml(r.piano.cliente.ragione_sociale),
        numero_rata: String(r.numero_rata),
        data_rata: fmtDateIt(r.data_rata),
        importo_rata: fmtEuro(Number(r.importo)),
        livello_piano: `L${r.piano.livello}`,
        piano_id: r.piano_id,
      };
      const oggetto = fillTemplate(tpl.oggetto ?? "", vars);
      const corpo = fillTemplate(tpl.corpo ?? "", vars);
      const html = wrapHtml(corpo);

      const res = await sendEmailViaEdge({ to: emailAmm, subject: oggetto, html });
      if (res.ok) {
        await supabaseAdmin
          .from("piani_rientro_rate" as never)
          .update({ reminder_inviato_il: new Date().toISOString() } as never)
          .eq("id", r.id);
        inviate++;
      } else {
        fallite++;
        console.error(`[piano-reminder] fail rata ${r.id}:`, res.err);
      }
    }

    return {
      ok: true, target_date: targetISO, giorni_anticipo: giorni,
      email: emailAmm, candidate: attive.length, inviate, fallite,
    };
  },
);
