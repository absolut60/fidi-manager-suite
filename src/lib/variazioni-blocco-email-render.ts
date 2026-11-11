// Render PURO della mail "Variazioni blocco clienti" (nessun import di supabase).
// Cornice e helper riusati da template-email-render.ts (fonte unica).
import { escapeHtml, wrapEmailHtml, SEDE_FALLBACK } from "@/lib/template-email-render";
import { euroAvviso, etichettaTipoAlert, type AlertEmail } from "@/lib/alert-fidi-email";

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

function tabellaAlert(list: AlertEmail[]): string {
  const cell = "padding:6px 10px;border:1px solid #e2e8f0;";
  const dx = `${cell}text-align:right;white-space:nowrap;`;
  const rows = [...list]
    .sort((a, b) => (a.ragione_sociale ?? "").localeCompare(b.ragione_sociale ?? "", "it", { sensitivity: "base" }))
    .map((a) => {
      const ordini = Math.round(Number(a.ordini_aperti ?? 0)) > 0 ? `<br><span style="font-size:12px;color:#0369a1;">Ordini in arrivo ${euroAvviso(a.ordini_aperti)}</span>` : "";
      const motivo = a.motivi.length ? a.motivi.join(", ") : etichettaTipoAlert(a.tipo);
      return `<tr>
        <td style="${cell}">${escapeHtml(a.ragione_sociale ?? "—")}${a.codice ? `<br><span style="font-size:12px;color:#64748b;">${escapeHtml(a.codice)}</span>` : ""}</td>
        <td style="${dx}">${Math.round(Number(a.consumo ?? 0) * 100)}%</td>
        <td style="${dx}">${euroAvviso(a.esposizione)}${ordini}</td>
        <td style="${dx}">${euroAvviso(a.fido_gamma)}</td>
        <td style="${dx}">${euroAvviso(a.fido_proposto)}</td>
        <td style="${cell}">${escapeHtml(motivo)}</td>
      </tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;border:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;margin:8px 0;">
    <thead><tr style="background:#f1f5f9;">
      <th style="${cell}text-align:left;">Cliente</th>
      <th style="${cell}">% usata</th>
      <th style="${cell}">Ci deve</th>
      <th style="${cell}">Fido Gamma</th>
      <th style="${cell}">Fido teorico</th>
      <th style="${cell}text-align:left;">Motivo</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function buildVariazioniBloccoEmail({
  negozioNome,
  bloccati,
  sbloccati,
  inLegale = [],
  uscitiLegale = [],
  appUrl,
  dataRilevazione,
  testInfo,
  alertFidi = [],
}: {
  negozioNome: string;
  bloccati: ClienteVariazione[];
  sbloccati: ClienteVariazione[];
  inLegale?: ClienteVariazione[];
  uscitiLegale?: ClienteVariazione[];
  appUrl: string;
  dataRilevazione: Date | string;
  testInfo?: { emailReali: string[] } | null;
  /** Nuovi alert fidi da gestire del negozio (sezione 3); vuota = sezione assente. */
  alertFidi?: AlertEmail[];
}): { oggetto: string; html: string } {
  const isTest = !!testInfo;
  const haVariazioni = bloccati.length + sbloccati.length + inLegale.length + uscitiLegale.length > 0;
  const oggetto = `${isTest ? "[TEST] " : ""}Aggiornamento clienti — ${negozioNome} — ${formatDataRoma(dataRilevazione)}`;

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
    `<p style="margin:0 0 12px;">Dopo l'ultimo aggiornamento dal gestionale, per i clienti della ${escapeHtml(negozioNome)} ci sono queste novità:</p>`,
  );
  const base = appUrl.replace(/\/+$/, "");
  const bottone = (href: string, testo: string) =>
    `<p style="margin:10px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">${escapeHtml(testo)}</a></p>`;
  if (bloccati.length || sbloccati.length) {
    parti.push(`<h2 style="margin:18px 0 4px;font-size:16px;color:#1e3a5f;">Clienti bloccati / sbloccati</h2>`);
  }
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
  if (inLegale.length || uscitiLegale.length) {
    parti.push(`<h2 style="margin:18px 0 4px;font-size:16px;color:#1e3a5f;">Entrati / usciti dal legale</h2>`);
  }
  if (inLegale.length) {
    parti.push(
      `<h3 style="margin:16px 0 4px;font-size:15px;color:#b91c1c;">Entrati in gestione legale (${inLegale.length})</h3>`,
      tabella(inLegale),
    );
  }
  if (uscitiLegale.length) {
    parti.push(
      `<h3 style="margin:16px 0 4px;font-size:15px;color:#15803d;">Usciti dalla gestione legale (${uscitiLegale.length})</h3>`,
      tabella(uscitiLegale),
    );
  }
  if (haVariazioni) parti.push(bottone(`${base}/clienti-variazioni-blocco`, "Apri l'elenco in FidiManager"));
  if (alertFidi.length) {
    parti.push(
      `<h2 style="margin:22px 0 4px;font-size:16px;color:#1e3a5f;">Alert fidi (${alertFidi.length})</h2>`,
      `<p style="margin:0 0 6px;font-size:13px;">Nuovi alert da gestire:</p>`,
      tabellaAlert(alertFidi),
      bottone(`${base}/alert-fidi`, "Apri Alert fidi"),
    );
  }

  const html = wrapEmailHtml(
    parti.join("\n"),
    SEDE_FALLBACK,
    { nome: "MADE Distribuzione — Sede centrale" },
    { useCid: true, senzaBande: true, sottotitolo: "Comunicazione dalla sede" },
  );
  return { oggetto, html };
}
