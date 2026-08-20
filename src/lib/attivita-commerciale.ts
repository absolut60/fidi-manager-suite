// Costanti e tipi condivisi delle attività commerciali (CRM).
export type TipoAttivita =
  | "appuntamento" | "visita" | "chiamata" | "email" | "preventivo_inviato" | "nota" | "altro";

export const TIPI_ATTIVITA: TipoAttivita[] = [
  "appuntamento", "visita", "chiamata", "email", "preventivo_inviato", "nota", "altro",
];

export const TIPO_ATTIVITA_LABEL: Record<TipoAttivita, string> = {
  appuntamento: "Appuntamento",
  visita: "Visita",
  chiamata: "Chiamata",
  email: "Email",
  preventivo_inviato: "Preventivo inviato",
  nota: "Nota",
  altro: "Altro",
};

export const TIPO_ATTIVITA_CLASS: Record<TipoAttivita, string> = {
  appuntamento: "bg-primary/15 text-primary border-primary/30",
  visita: "bg-teal-600/15 text-teal-700 border-teal-600/30",
  chiamata: "bg-sky-600/15 text-sky-700 border-sky-600/30",
  email: "bg-violet-600/15 text-violet-700 border-violet-600/30",
  preventivo_inviato: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  nota: "bg-muted text-muted-foreground border-border",
  altro: "bg-muted text-muted-foreground border-border",
};

export type AttivitaRow = {
  id: string;
  opportunita_id: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  tipo: TipoAttivita;
  titolo: string;
  descrizione: string | null;
  data_pianificata: string | null;
  data_svolgimento: string | null;
  completata: boolean;
  esito: string | null;
  agente_codice: string | null;
  operatore_id: string | null;
  store_id: string | null;
  luogo: string | null;
  note: string | null;
  created_at: string;
};

export function fmtDataOra(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
