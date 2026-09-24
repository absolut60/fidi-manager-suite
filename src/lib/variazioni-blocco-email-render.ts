// Render PURO della mail "Variazioni blocco clienti" (nessun import di supabase).
// Cornice e helper riusati da template-email-render.ts (fonte unica).
import { escapeHtml, wrapEmailHtml, SEDE_FALLBACK } from "@/lib/template-email-render";

export type ClienteVariazione = { codice: string | null; ragione_sociale: string | null };

function formatDataRoma(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dt);
}

function ordina(list: ClienteVariazione[]): ClienteVariazione[] {
  return [...list].sort((a, b) =>
    (a.ragione_sociale ?? "").localeCompare(b.ragione_sociale ?? "", "it", { sensitivity: "base" }),
  );
}

function tabella(list: ClienteVariazione[]): string {
  const cell = "padding:6px 10px;border:1px solid #e2e8f0;";
  const rows = ordina(list)
    .map(
      (c) => `<tr>
        <td style="${cell}">${escapeHtml(c.codice ?? "—")}</td>
        <td style="${cell}">${escapeHtml(c.ragione_sociale ?? "—")}</td>
      </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;border:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;margin:8px 0;">
    <thead><tr style="background:#f1f5f9;">
      <th style="${cell}text-align:left;">Codice</th>
      <th style="${cell}text-align:left;">Ragione sociale</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function buildVariazioniBloccoEmail({
  negozioNome,
  bloccati,
  sbloccati,
  appUrl,
  dataRilevazione,
  testInfo,
}: {
  negozioNome: string;
  bloccati: ClienteVariazione[];
  sbloccati: ClienteVariazione[];
  appUrl: string;
  dataRilevazione: Date | string;
  testInfo?: { emailReali: string[] } | null;
}): { oggetto: string; html: string } {
  const isTest = !!testInfo;
  const oggetto = `${isTest ? "[TEST] " : ""}Variazioni blocco clienti — ${negozioNome} — ${formatDataRoma(dataRilevazione)}`;

  const parti: string[] = [];
  if (isTest) {
    const elenco = testInfo!.emailReali.length
      ? testInfo!.emailReali.map(escapeHtml).join(", ")
      : "(nessuno store manager con email valida)";
    parti.push(
      `<div style="border:2px solid #f59e0b;background:#fef3c7;color:#78350f;padding:10px 12px;margin:0 0 14px;border-radius:6px;font-size:13px;"><strong>MODALITÀ TEST</strong> — in produzione questa mail sarebbe andata a: ${elenco}</div>`,
    );
  }
  parti.push(
    `<p style="margin:0 0 12px;">Dopo l'ultimo aggiornamento dal gestionale, per i clienti della ${escapeHtml(negozioNome)} risultano queste variazioni dello stato di blocco:</p>`,
  );
  if (bloccati.length) {
    parti.push(
      `<h3 style="margin:16px 0 4px;font-size:15px;color:#b91c1c;">Nuovi clienti bloccati (${bloccati.length})</h3>`,
      tabella(bloccati),
    );
  }
  if (sbloccati.length) {
    parti.push(
      `<h3 style="margin:16px 0 4px;font-size:15px;color:#15803d;">Clienti sbloccati (${sbloccati.length})</h3>`,
      tabella(sbloccati),
    );
  }
  const link = `${appUrl.replace(/\/+$/, "")}/clienti-variazioni-blocco`;
  parti.push(
    `<p style="margin:18px 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">Apri l'elenco in FidiManager</a></p>`,
  );

  const html = wrapEmailHtml(
    parti.join("\n"),
    SEDE_FALLBACK,
    { nome: "MADE Distribuzione — Sede centrale" },
    { useCid: true, senzaBande: true, sottotitolo: "Comunicazione dalla sede" },
  );
  return { oggetto, html };
}
