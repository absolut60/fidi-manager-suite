// Helpers per i template di LETTERA cartacea.
// Stesso motore placeholder di template-email ma rendering in TESTO (non HTML)
// e con placeholder aggiuntivi per intestazione cliente, luogo/data, sede mittente.

import { supabase } from "@/integrations/supabase/client";
import { classificaScadenza } from "@/lib/scadenze";
import { formatEuro, formatDateIt, SEDE_FALLBACK, type DatiSede, type ScadenzaSollecito } from "@/lib/template-email-render";
import { calcolaSpeseInsoluto, buildTotaliBloccoTesto } from "@/lib/spese-insoluto";

export type TemplateLettera = {
  id: string;
  nome: string;
  oggetto: string | null;
  corpo: string;
  tipo: string;
  usa_dati_automatici: boolean;
  attivo: boolean;
};

export type PlaceholderLetteraKey =
  | "ragione_sociale"
  | "indirizzo_cliente"
  | "cap_citta_cliente"
  | "totale_scaduto"
  | "spese_insoluto"
  | "totale_da_pagare"
  | "n_riba"
  | "elenco_scadenze"
  | "data_oggi"
  | "luogo_data"
  | "nome_operatore"
  | "insegna_sede"
  | "indirizzo_sede";

export const PLACEHOLDERS_LETTERA: {
  key: PlaceholderLetteraKey;
  label: string;
  descr: string;
  soloCorpo?: boolean;
}[] = [
  { key: "ragione_sociale", label: "{{ragione_sociale}}", descr: "Denominazione del cliente" },
  { key: "indirizzo_cliente", label: "{{indirizzo_cliente}}", descr: "Via/indirizzo del cliente" },
  { key: "cap_citta_cliente", label: "{{cap_citta_cliente}}", descr: "CAP, città e provincia del cliente" },
  { key: "totale_scaduto", label: "{{totale_scaduto}}", descr: "Somma delle scadenze in lettera (senza spese)" },
  { key: "spese_insoluto", label: "{{spese_insoluto}}", descr: "Spese di insoluto (nRiBa × importo unitario)" },
  { key: "totale_da_pagare", label: "{{totale_da_pagare}}", descr: "Totale scaduto + spese di insoluto RiBa" },
  { key: "n_riba", label: "{{n_riba}}", descr: "Numero di scadenze RiBa in lettera" },
  { key: "elenco_scadenze", label: "{{elenco_scadenze}}", descr: "Elenco testuale delle scadenze scadute (include riepilogo totali)", soloCorpo: true },
  { key: "data_oggi", label: "{{data_oggi}}", descr: "Data odierna (gg/mm/aaaa)" },
  { key: "luogo_data", label: "{{luogo_data}}", descr: "Luogo e data (es. \"Casorezzo, 16/06/2026\")" },
  { key: "nome_operatore", label: "{{nome_operatore}}", descr: "Nome dell'operatore che firma" },
  { key: "insegna_sede", label: "{{insegna_sede}}", descr: "Insegna/ragione sociale della sede mittente" },
  { key: "indirizzo_sede", label: "{{indirizzo_sede}}", descr: "Indirizzo completo della sede mittente" },
];

export type DatiClienteLettera = {
  ragione_sociale: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
};

export type DatiTemplateLettera = {
  cliente: DatiClienteLettera;
  scadenze: ScadenzaSollecito[];
  nome_operatore: string;
  sede: DatiSede | null;
};

function buildIndirizzoCliente(c: DatiClienteLettera): string {
  return (c.indirizzo ?? "").trim();
}

function buildCapCittaCliente(c: DatiClienteLettera): string {
  const cap = (c.cap ?? "").trim();
  const citta = (c.citta ?? "").trim();
  const prov = (c.provincia ?? "").trim();
  const provPart = prov ? ` (${prov})` : "";
  const right = `${citta}${provPart}`.trim();
  return [cap, right].filter(Boolean).join(" ").trim();
}

function buildLuogoData(sede: DatiSede | null): string {
  const s = sede ?? SEDE_FALLBACK;
  const luogo = (s.citta ?? "").trim() || "—";
  return `${luogo}, ${formatDateIt(new Date())}`;
}

function buildInsegnaSede(sede: DatiSede | null): string {
  const s = sede ?? SEDE_FALLBACK;
  return (s.insegna ?? s.nome ?? "").trim();
}

function buildIndirizzoSede(sede: DatiSede | null): string {
  const s = sede ?? SEDE_FALLBACK;
  const indir = (s.indirizzo ?? "").trim();
  const cap = (s.cap ?? "").trim();
  const citta = (s.citta ?? "").trim();
  const prov = (s.provincia ?? "").trim();
  const right = [cap, citta, prov ? `(${prov})` : ""].filter(Boolean).join(" ").trim();
  return [indir, right].filter(Boolean).join(", ");
}

export function buildElencoScadenzeTesto(
  scadenze: ScadenzaSollecito[],
  opts?: { speseImportoUnitario?: number },
): string {
  if (!scadenze.length) return "Nessuna scadenza scaduta al momento.";
  const righe = scadenze.map((s) => {
    const doc = s.numero_documento ?? "—";
    const dataDoc = formatDateIt(s.data_documento);
    const dataScad = formatDateIt(s.data_scadenza);
    const importo = formatEuro(s.importo_scadenza);
    return `  • Doc. ${doc} del ${dataDoc} — scadenza ${dataScad} — ${importo}`;
  });
  const totals = calcolaSpeseInsoluto(scadenze, Number(opts?.speseImportoUnitario ?? 0));
  return [...righe, "", buildTotaliBloccoTesto(totals)].join("\n");
}

function replaceAll(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key) => {
    const k = String(key).trim().toLowerCase();
    return k in values ? values[k] : "";
  });
}

export type RenderedLettera = { oggetto: string; corpo: string };

export function renderLettera(
  template: { oggetto: string | null; corpo: string },
  dati: DatiTemplateLettera,
  opts?: { speseImportoUnitario?: number },
): RenderedLettera {
  const totals = calcolaSpeseInsoluto(dati.scadenze, Number(opts?.speseImportoUnitario ?? 0));
  const values: Record<PlaceholderLetteraKey, string> = {
    ragione_sociale: dati.cliente.ragione_sociale ?? "",
    indirizzo_cliente: buildIndirizzoCliente(dati.cliente),
    cap_citta_cliente: buildCapCittaCliente(dati.cliente),
    totale_scaduto: formatEuro(totals.totaleScaduto),
    spese_insoluto: formatEuro(totals.speseInsoluto),
    totale_da_pagare: formatEuro(totals.totaleDaPagare),
    n_riba: String(totals.nRiba),
    elenco_scadenze: buildElencoScadenzeTesto(dati.scadenze, { speseImportoUnitario: opts?.speseImportoUnitario }),
    data_oggi: formatDateIt(new Date()),
    luogo_data: buildLuogoData(dati.sede),
    nome_operatore: dati.nome_operatore ?? "",
    insegna_sede: buildInsegnaSede(dati.sede),
    indirizzo_sede: buildIndirizzoSede(dati.sede),
  };
  return {
    oggetto: replaceAll(template.oggetto ?? "", values),
    corpo: replaceAll(template.corpo ?? "", values),
  };
}

export async function caricaDatiClienteLettera(
  clienteId: string,
  nomeOperatore: string,
): Promise<DatiTemplateLettera> {
  const { data: cliente, error: e1 } = await supabase
    .from("clienti")
    .select("ragione_sociale, indirizzo, cap, citta, provincia, store_id")
    .eq("id", clienteId)
    .maybeSingle();
  if (e1) throw e1;

  const { data: rawScad, error: e2 } = await supabase
    .from("scadenze")
    .select(
      "numero_documento, data_documento, data_scadenza, importo_scadenza, codice_pagamento, stato_contabile, giorni_ritardo, tempi_scadenza, data_pagamento_effettiva",
    )
    .eq("cliente_id", clienteId)
    .order("data_scadenza", { ascending: true });
  if (e2) throw e2;

  const scadute = (rawScad ?? []).filter((s) => classificaScadenza(s) === "scaduto");

  let sede: DatiSede | null = null;
  if (cliente?.store_id) {
    const { data: store } = await supabase
      .from("stores")
      .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
      .eq("id", cliente.store_id)
      .maybeSingle();
    if (store) {
      sede = {
        nome: store.nome ?? null,
        insegna: (store as { insegna?: string | null }).insegna ?? null,
        indirizzo: store.indirizzo ?? null,
        cap: store.cap ?? null,
        citta: store.citta ?? null,
        provincia: store.provincia ?? null,
        telefono: store.telefono ?? null,
      };
    }
  }

  return {
    cliente: {
      ragione_sociale: cliente?.ragione_sociale ?? "",
      indirizzo: cliente?.indirizzo ?? null,
      cap: cliente?.cap ?? null,
      citta: cliente?.citta ?? null,
      provincia: cliente?.provincia ?? null,
    },
    scadenze: scadute.map((s) => ({
      numero_documento: s.numero_documento,
      data_documento: s.data_documento,
      data_scadenza: s.data_scadenza,
      importo_scadenza: s.importo_scadenza,
      codice_pagamento: s.codice_pagamento,
    })),
    nome_operatore: nomeOperatore,
    sede,
  };
}
