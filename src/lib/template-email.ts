import { supabase } from "@/integrations/supabase/client";
import { classificaScadenza } from "@/lib/scadenze";

export type TemplateEmail = {
  id: string;
  nome: string;
  oggetto: string;
  corpo: string;
  tipo: string;
  attivo: boolean;
};

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type DatiTemplate = {
  ragione_sociale: string;
  scadenze: ScadenzaSollecito[];
  nome_operatore: string;
};

export type RenderedTemplate = { oggetto: string; corpo: string };

export function renderTemplate(template: { oggetto: string; corpo: string }, dati: DatiTemplate): RenderedTemplate {
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

export async function caricaDatiCliente(clienteId: string, nomeOperatore: string): Promise<DatiTemplate> {
  const { data: cliente, error: e1 } = await supabase
    .from("clienti")
    .select("ragione_sociale")
    .eq("id", clienteId)
    .maybeSingle();
  if (e1) throw e1;

  const { data: rawScad, error: e2 } = await supabase
    .from("scadenze")
    .select("numero_documento, data_scadenza, importo_scadenza, stato_contabile, giorni_ritardo, tempi_scadenza")
    .eq("cliente_id", clienteId)
    .order("data_scadenza", { ascending: true });
  if (e2) throw e2;

  const scadute = (rawScad ?? []).filter((s) => classificaScadenza(s) === "scaduto");

  return {
    ragione_sociale: cliente?.ragione_sociale ?? "",
    nome_operatore: nomeOperatore,
    scadenze: scadute.map((s) => ({
      numero_documento: s.numero_documento,
      data_scadenza: s.data_scadenza,
      importo_scadenza: s.importo_scadenza,
    })),
  };
}
