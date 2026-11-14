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
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  sede_riferimento_id: string | null;
  sede_riferimento?: { nome: string } | null;
  note: string | null;
  created_at: string;
};

export function fmtDataOra(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

type AmbitoAttivita = {
  attivita?: Pick<AttivitaRow, "store_id" | "sede_riferimento_id"> | null;
  contestoStoreId?: string | null;
  soggettoScelto?: boolean;
  soggettoStoreId?: string | null;
};

/** store_id governa la visibilità; la sede di riferimento è soltanto operativa. */
export function storeIdAttivita({ attivita, contestoStoreId, soggettoScelto, soggettoStoreId }: AmbitoAttivita): string | null {
  if (attivita) return attivita.store_id;
  return (soggettoScelto ? soggettoStoreId : contestoStoreId) ?? null;
}

/** La scelta manuale, compresa Nessuna, prevale sui metadati arrivati dopo. */
export function sedeInizialeAttivita(ambito: AmbitoAttivita & { sceltaManuale?: string | null }): string | null {
  if (ambito.sceltaManuale !== undefined) return ambito.sceltaManuale;
  if (ambito.attivita) return ambito.attivita.sede_riferimento_id;
  return storeIdAttivita(ambito);
}

/** Unico formato per indirizzo strutturato, luogo storico e sede operativa. */
export function luogoAttivita(a: Partial<Pick<AttivitaRow, "indirizzo" | "cap" | "citta" | "provincia" | "luogo" | "sede_riferimento">>): string {
  const via = a.indirizzo?.trim();
  const comune = [a.cap?.trim(), a.citta?.trim()].filter(Boolean).join(" ");
  const provincia = a.provincia?.trim().toUpperCase();
  const localita = [comune, provincia ? `(${provincia})` : ""].filter(Boolean).join(" ");
  const indirizzo = via ? [via, localita].filter(Boolean).join(", ") : a.luogo?.trim();
  const sede = a.sede_riferimento?.nome?.trim();
  return [indirizzo, sede ? `Sede di riferimento: ${sede}` : ""].filter(Boolean).join(" · ");
}
