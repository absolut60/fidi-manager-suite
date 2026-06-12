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
