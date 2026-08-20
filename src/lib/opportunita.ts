// Costanti e helper condivisi del modulo commerciale (opportunità).
export type TipoOpportunita = "vendita" | "fornitura" | "preventivo" | "altro";
export type StatoOpportunita = "aperta" | "in_lavorazione" | "preventivo" | "vinta" | "persa";

export const TIPI_OPPORTUNITA: TipoOpportunita[] = ["vendita", "fornitura", "preventivo", "altro"];
export const STATI_OPPORTUNITA: StatoOpportunita[] = ["aperta", "in_lavorazione", "preventivo", "vinta", "persa"];

export const TIPO_LABEL: Record<TipoOpportunita, string> = {
  vendita: "Vendita",
  fornitura: "Fornitura",
  preventivo: "Preventivo",
  altro: "Altro",
};

export const STATO_LABEL: Record<StatoOpportunita, string> = {
  aperta: "Aperta",
  in_lavorazione: "In lavorazione",
  preventivo: "Preventivo",
  vinta: "Vinta",
  persa: "Persa",
};

export const STATO_CLASS: Record<StatoOpportunita, string> = {
  aperta: "bg-muted text-muted-foreground border-border",
  in_lavorazione: "bg-primary/15 text-primary border-primary/30",
  preventivo: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  vinta: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  persa: "bg-destructive/15 text-destructive border-destructive/30",
};

export type OpportunitaRow = {
  id: string;
  titolo: string;
  descrizione: string | null;
  tipo: TipoOpportunita;
  stato: StatoOpportunita;
  cliente_id: string | null;
  lead_id: string | null;
  cantiere_id: string | null;
  agente_codice: string | null;
  assegnato_a: string | null;
  store_id: string | null;
  valore_stimato: number | null;
  probabilita: number | null;
  data_prevista_chiusura: string | null;
  data_chiusura: string | null;
  motivo_perdita: string | null;
  note: string | null;
  created_at: string;
  clienti?: { ragione_sociale: string | null; codice_agente: string | null } | null;
  lead?: { ragione_sociale: string | null; nome: string | null; cognome: string | null } | null;
  cantieri?: { nome: string | null } | null;
};

export function nomeSoggetto(o: OpportunitaRow): string {
  if (o.clienti?.ragione_sociale) return o.clienti.ragione_sociale;
  if (o.lead) {
    const n = o.lead.ragione_sociale?.trim() || `${o.lead.nome ?? ""} ${o.lead.cognome ?? ""}`.trim();
    if (n) return n;
  }
  return "—";
}

export function fmtEuro(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

export function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("it-IT");
}
