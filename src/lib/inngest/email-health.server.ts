// Job di sorveglianza del canale email.
// Cron giornaliero (09:00 UTC): aggrega gli esiti di invio degli ultimi 7 giorni
// e delle ultime 24 ore su tutti i canali (promemoria scadenza, campagne
// sollecito, campagne marketing) e invia un'allerta all'amministrazione quando
// il canale sembra fermo o degradato.
//
// Idempotente: non invia più di un'allerta al giorno (marca su `configurazioni`).
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";

export interface StatoCanaleEmail {
  canale: string;
  riusciti_7g: number;
  falliti_7g: number;
  riusciti_24h: number;
  falliti_24h: number;
  ultimo_successo: string | null;
  ultimo_errore: string | null;
  ultimo_errore_at: string | null;
}

const CHIAVE_ULTIMO_ALERT = "email_health_ultimo_alert";

async function getConfig(chiave: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  return (data?.valore ?? "").toString().trim();
}

async function setConfig(chiave: string, valore: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("chiave")
    .eq("chiave", chiave)
    .maybeSingle();
  if (data) {
    await supabaseAdmin.from("configurazioni").update({ valore }).eq("chiave", chiave);
  } else {
    await supabaseAdmin.from("configurazioni").insert({ chiave, valore });
  }
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Aggrega lo stato del canale email sugli ultimi 7 giorni / 24 ore.
 * Usata sia dal job di allarme sia dalla card "Stato canale email" in Impostazioni.
 */
export async function raccogliStatoCanaleEmail(): Promise<{
  canali: StatoCanaleEmail[];
  errori_distinti: string[];
  errori_24h_credenziali: string[];
}> {
  const from7 = isoDaysAgo(7);
  const from24 = isoDaysAgo(1);
  const canali: StatoCanaleEmail[] = [];
  const erroriDistinti = new Set<string>();
  const erroriCredenziali: string[] = [];

  const registra = (
    canale: string,
    righe: Array<{ ok: boolean; at: string; errore: string | null }>,
  ) => {
    const ok7 = righe.filter((r) => r.ok);
    const ko7 = righe.filter((r) => !r.ok);
    const ok24 = ok7.filter((r) => r.at >= from24);
    const ko24 = ko7.filter((r) => r.at >= from24);
    const ultimoErrore = ko7[0] ?? null;
    canali.push({
      canale,
      riusciti_7g: ok7.length,
      falliti_7g: ko7.length,
      riusciti_24h: ok24.length,
      falliti_24h: ko24.length,
      ultimo_successo: ok7[0]?.at ?? null,
      ultimo_errore: ultimoErrore?.errore ?? null,
      ultimo_errore_at: ultimoErrore?.at ?? null,
    });
    for (const r of ko7) if (r.errore) erroriDistinti.add(r.errore.slice(0, 300));
    for (const r of ko24) {
      const e = r.errore ?? "";
      if (/535|Invalid login|EAUTH/i.test(e)) erroriCredenziali.push(e.slice(0, 300));
    }
  };

  const { data: prom } = await supabaseAdmin
    .from("promemoria_scadenza_log")
    .select("esito, errore, created_at")
    .gte("created_at", from7)
    .order("created_at", { ascending: false });
  registra(
    "Promemoria scadenza",
    ((prom ?? []) as Array<{ esito: string; errore: string | null; created_at: string }>)
      .filter((r) => r.esito === "inviato" || r.esito === "fallito")
      .map((r) => ({ ok: r.esito === "inviato", at: r.created_at, errore: r.errore })),
  );

  const { data: soll } = await supabaseAdmin
    .from("campagne_sollecito_destinatari")
    .select("stato, errore, inviato_at, created_at")
    .gte("created_at", from7)
    .order("created_at", { ascending: false });
  registra(
    "Campagne sollecito",
    ((soll ?? []) as Array<{
      stato: string;
      errore: string | null;
      inviato_at: string | null;
      created_at: string;
    }>)
      .filter((r) => r.stato === "inviato" || r.stato === "fallito")
      .map((r) => ({
        ok: r.stato === "inviato",
        at: r.inviato_at ?? r.created_at,
        errore: r.errore,
      })),
  );

  const { data: mkt } = await supabaseAdmin
    .from("campagne_email_destinatari")
    .select("stato_invio, errore, inviato_at, created_at")
    .gte("created_at", from7)
    .order("created_at", { ascending: false });
  registra(
    "Campagne marketing",
    ((mkt ?? []) as Array<{
      stato_invio: string;
      errore: string | null;
      inviato_at: string | null;
      created_at: string;
    }>)
      .filter((r) => r.stato_invio === "inviato" || r.stato_invio === "fallito")
      .map((r) => ({
        ok: r.stato_invio === "inviato",
        at: r.inviato_at ?? r.created_at,
        errore: r.errore,
      })),
  );

  return {
    canali,
    errori_distinti: Array.from(erroriDistinti).slice(0, 5),
    errori_24h_credenziali: erroriCredenziali,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const emailHealthCheck = inngest.createFunction(
  {
    id: "email-health-check",
    name: "Sorveglianza canale email",
    triggers: [{ cron: "0 9 * * *" }],
  },
  async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const ultimoAlert = await getConfig(CHIAVE_ULTIMO_ALERT);
    if (ultimoAlert === oggi) {
      return { ok: true, skipped: "alert_gia_inviato_oggi" };
    }

    const stato = await raccogliStatoCanaleEmail();
    const tot = stato.canali.reduce(
      (a, c) => ({
        ok7: a.ok7 + c.riusciti_7g,
        ko7: a.ko7 + c.falliti_7g,
        ok24: a.ok24 + c.riusciti_24h,
        ko24: a.ko24 + c.falliti_24h,
      }),
      { ok7: 0, ko7: 0, ok24: 0, ko24: 0 },
    );

    const tentativi24 = tot.ok24 + tot.ko24;
    const motivi: string[] = [];
    if (tot.ok7 === 0) motivi.push("Nessun invio riuscito negli ultimi 7 giorni (canale potenzialmente fermo).");
    if (tentativi24 >= 3 && tot.ko24 / tentativi24 > 0.3) {
      motivi.push(
        `Nelle ultime 24 ore il ${Math.round((tot.ko24 / tentativi24) * 100)}% degli invii è fallito (${tot.ko24}/${tentativi24}).`,
      );
    }
    if (stato.errori_24h_credenziali.length > 0) {
      motivi.push("Rilevati errori di autenticazione SMTP (535 / Invalid login / EAUTH) nelle ultime 24 ore.");
    }

    if (motivi.length === 0) {
      return { ok: true, alert: false, totali: tot };
    }

    const email =
      (await getConfig("email_amministrazione_notifiche")) ||
      (await getConfig("piano_rientro_email_amministrazione"));
    if (!email) {
      return { ok: false, alert: true, motivi, reason: "email_amministrazione_non_configurata" };
    }

    const righe = stato.canali
      .map(
        (c) =>
          `<tr><td style="padding:4px 8px;border:1px solid #e2e8f0;">${esc(c.canale)}</td>
           <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${c.riusciti_24h} / ${c.falliti_24h}</td>
           <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${c.riusciti_7g} / ${c.falliti_7g}</td>
           <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;">${c.ultimo_successo ? new Date(c.ultimo_successo).toLocaleString("it-IT") : "—"}</td></tr>`,
      )
      .join("");

    const erroriHtml = stato.errori_distinti.length
      ? `<ul>${stato.errori_distinti.map((e) => `<li style="font-family:monospace;font-size:11px;">${esc(e)}</li>`).join("")}</ul>`
      : "<p>Nessun messaggio d'errore registrato.</p>";

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
<div style="max-width:680px;margin:0 auto;padding:16px 20px;">
  <h2 style="color:#b91c1c;margin:0 0 8px;">⚠️ Allerta canale email</h2>
  <p>Il sistema di sorveglianza ha rilevato un possibile problema nell'invio delle email.</p>
  <ul>${motivi.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
  <p style="font-size:12px;color:#64748b;">Periodo analizzato: ultime 24 ore e ultimi 7 giorni (fino al ${new Date().toLocaleString("it-IT")}).</p>
  <table style="border-collapse:collapse;font-size:13px;margin-top:12px;">
    <thead><tr>
      <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left;">Canale</th>
      <th style="padding:4px 8px;border:1px solid #e2e8f0;">24h (ok/ko)</th>
      <th style="padding:4px 8px;border:1px solid #e2e8f0;">7gg (ok/ko)</th>
      <th style="padding:4px 8px;border:1px solid #e2e8f0;">Ultimo invio riuscito</th>
    </tr></thead>
    <tbody>${righe}</tbody>
  </table>
  <h3 style="margin-top:20px;font-size:14px;">Primi messaggi d'errore distinti</h3>
  ${erroriHtml}
  <hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;" />
  <p style="font-size:11px;color:#64748b;">Email generata automaticamente da FidiManager — sorveglianza canale email.</p>
</div></body></html>`;

    const res = await sendEmailViaEdge({
      to: email,
      subject: "⚠️ Allerta: canale email FidiManager",
      html,
    });

    // Marca l'alert del giorno anche se l'invio fallisce: se il canale è
    // rotto, ritentare nello stesso giorno non aiuta.
    await setConfig(CHIAVE_ULTIMO_ALERT, oggi);

    return { ok: res.ok, alert: true, motivi, email, err: res.err ?? null, totali: tot };
  },
);
