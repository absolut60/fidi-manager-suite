// Helpers PURI per il rendering dei template email.
// NIENTE import di supabase: questo modulo deve poter girare sia nel browser
// sia nel worker Inngest. Mantieni questo file privo di side-effect.

export type PlaceholderKey =
  | "ragione_sociale"
  | "totale_scaduto"
  | "elenco_scadenze"
  | "data_oggi"
  | "nome_operatore";

export const PLACEHOLDERS: { key: PlaceholderKey; label: string; descr: string; soloCorpo?: boolean }[] = [
  { key: "ragione_sociale", label: "{{ragione_sociale}}", descr: "Denominazione del cliente" },
  { key: "totale_scaduto", label: "{{totale_scaduto}}", descr: "Importo totale scaduto, formato euro" },
  { key: "elenco_scadenze", label: "{{elenco_scadenze}}", descr: "Tabella HTML delle scadenze scadute", soloCorpo: true },
  { key: "data_oggi", label: "{{data_oggi}}", descr: "Data odierna", soloCorpo: true },
  { key: "nome_operatore", label: "{{nome_operatore}}", descr: "Nome dell'operatore", soloCorpo: true },
];

const fmtEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const fmtData = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatEuro(n: number | null | undefined): string {
  return fmtEuro.format(Number(n ?? 0));
}

export function formatDateIt(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return fmtData.format(date);
}

export type ScadenzaSollecito = {
  numero_documento: string | null;
  data_scadenza: string | null;
  importo_scadenza: number | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildElencoScadenzeHtml(scadenze: ScadenzaSollecito[]): string {
  if (!scadenze.length) {
    return '<p style="margin:8px 0;color:#475569;">Nessuna scadenza scaduta al momento.</p>';
  }
  const totale = scadenze.reduce((acc, s) => acc + Number(s.importo_scadenza ?? 0), 0);
  const rows = scadenze
    .map(
      (s) => `<tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(s.numero_documento ?? "—")}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(formatDateIt(s.data_scadenza))}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatEuro(s.importo_scadenza))}</td>
      </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;border:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;margin:8px 0;">
    <thead><tr style="background:#f1f5f9;">
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Documento</th>
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Scadenza</th>
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">Importo</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f8fafc;font-weight:600;">
      <td colspan="2" style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">Totale</td>
      <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatEuro(totale))}</td>
    </tr></tfoot>
  </table>`;
}

export type DatiTemplate = {
  ragione_sociale: string;
  scadenze: ScadenzaSollecito[];
  nome_operatore: string;
};

export type RenderedTemplate = { oggetto: string; corpo: string };

export function renderTemplate(
  template: { oggetto: string; corpo: string },
  dati: DatiTemplate,
): RenderedTemplate {
  const totale = dati.scadenze.reduce((a, s) => a + Number(s.importo_scadenza ?? 0), 0);
  const values: Record<PlaceholderKey, string> = {
    ragione_sociale: dati.ragione_sociale ?? "",
    totale_scaduto: formatEuro(totale),
    elenco_scadenze: buildElencoScadenzeHtml(dati.scadenze),
    data_oggi: formatDateIt(new Date()),
    nome_operatore: dati.nome_operatore ?? "",
  };
  return {
    oggetto: replaceAll(template.oggetto ?? "", values),
    corpo: replaceAll(template.corpo ?? "", values),
  };
}

function replaceAll(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key) => {
    const k = String(key).trim().toLowerCase();
    return k in values ? values[k] : "";
  });
}

// Replica della logica di `classificaScadenza` ma senza dipendenze esterne,
// per uso nel worker Inngest.
export function isScaduto(s: {
  stato_contabile?: string | null;
  giorni_ritardo?: number | null;
  tempi_scadenza?: string | null;
}): boolean {
  const t = String(s.tempi_scadenza ?? "").toLowerCase();
  if (t.includes("pagat")) return false;
  if (t.includes("a scadere")) return false;
  if (t.includes("scadut")) return true;
  if (s.stato_contabile === "Aperta" && Number(s.giorni_ritardo ?? 0) > 0) return true;
  return false;
}

// =============================================================================
// CORNICE HTML EMAIL (header con logo, footer con dati sede)
// =============================================================================

// Logo MADE servito dal CDN Lovable (URL stabile, immutabile, pubblico).
// Verificato 200 OK; usato nell'<img> dell'header email.
export const LOGO_EMAIL_URL =
  "https://fidi-manager-suite.lovable.app/__l5e/assets-v1/035e2dea-71e9-4ef5-a16d-94aee28def35/logo-made.png";

// Display name fisso del mittente (richiesto da branding).
// L'indirizzo email del from resta quello SMTP autenticato lato edge function;
// il Reply-To dinamico (email operatore) viene impostato dal chiamante.
export const FROM_NAME_ISTITUZIONALE = "Recupero Crediti MADE";

export type DatiSede = {
  nome: string | null;        // es. "SEDE DI LISSONE"
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  telefono: string | null;
};

export type DatiMittente = {
  nome: string;   // "Andrea Giani"
  email?: string | null;
};

// Sede amministrativa di fallback (vedi memoria progetto)
export const SEDE_FALLBACK: DatiSede = {
  nome: "Sede Amministrativa",
  indirizzo: "Via G. Di Vittorio, 3",
  cap: "20003",
  citta: "Casorezzo",
  provincia: "MI",
  telefono: "02 90380000",
};

function formatSedeLine(s: DatiSede | null | undefined): string {
  const sede = s && (s.indirizzo || s.citta || s.telefono) ? s : SEDE_FALLBACK;
  // "Filiale di Lissone — Via Matteotti 146, 20851 Lissone (MB) — Tel. 039/2459392"
  const nomeBreve = (sede.nome ?? "")
    .replace(/^SEDE DI\s+/i, "")
    .trim() || (sede.citta ?? "");
  const indir = sede.indirizzo ? sede.indirizzo.trim() : "";
  const cap = sede.cap ? sede.cap.trim() : "";
  const city = sede.citta ? sede.citta.trim() : "";
  const prov = sede.provincia ? `(${sede.provincia.trim()})` : "";
  const tel = sede.telefono ? `Tel. ${sede.telefono.trim()}` : "";
  const indPart = [indir, [cap, city, prov].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const label = nomeBreve ? `Filiale di ${escapeHtml(nomeBreve)}` : "Filiale di riferimento";
  return [label, escapeHtml(indPart), escapeHtml(tel)].filter(Boolean).join(" — ");
}

export function wrapEmailHtml(
  corpoRenderizzato: string,
  datiSede: DatiSede | null | undefined,
  datiMittente: DatiMittente,
): string {
  const sedeLine = formatSedeLine(datiSede);
  const operatore = escapeHtml(datiMittente.nome || "Operatore");
  const operatoreEmail = datiMittente.email
    ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(datiMittente.email)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Sollecito</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr>
        <td style="background:#0d1f3c;padding:18px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <img src="${LOGO_EMAIL_URL}" alt="MADE" width="140" height="auto" style="display:block;border:0;outline:none;text-decoration:none;background:transparent;" />
            </td>
            <td align="right" style="vertical-align:middle;color:#ffffff;font-size:11px;font-family:Arial,Helvetica,sans-serif;">
              <div style="opacity:.85;">Gruppo MADE</div>
              <div style="opacity:.6;font-size:10px;">Amministrazione &amp; Crediti</div>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;">
          ${corpoRenderizzato}
          <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;">
            <div style="font-weight:600;color:#0d1f3c;">${operatore}</div>
            ${operatoreEmail}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6b7280;">
          <div style="color:#374151;font-weight:600;">${sedeLine}</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb;">
            <strong style="color:#374151;">MADE DISTRIBUZIONE S.p.A.</strong><br/>
            Sede Legale: Corso di Porta Nuova 11, 20121 Milano (MI) — C.F. e P.IVA 10126430965 — REA Milano MI 2507310<br/>
            PEC: madedistribuzionesrl@pecplus.it — Capitale Sociale 2.593.000,00 € i.v.<br/>
            Società sotto la Direzione e il Coordinamento di MADE Italia S.p.A.
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
