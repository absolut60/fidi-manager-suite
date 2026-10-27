// Fonte unica di etichette, colori e icone per le Richieste interne.
// Solo presentazione: nessuna regola di permesso o di business vive qui.
import {
  Banknote, CheckCircle2, ClipboardList, Hourglass, Inbox, ShoppingCart, Wrench, XCircle, FileText,
  Archive, Circle, FilePlus2, LayoutDashboard, ListChecks, Send, Paperclip, ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export type StileVoce = {
  label: string;
  /** Classi per il badge (sfondo, testo, bordo) con varianti dark. */
  badge: string;
  /** Colore del bordo sinistro (da usare con border-l-4). */
  bordo: string;
  /** Sfondo + testo per cerchietti icona / contatori. */
  tinta: string;
  /** Bordo superiore (da usare con border-t-4). */
  bordoAlto: string;
  /** Fascia/sfondo leggero con testo colorato. */
  fascia: string;
  /** Pallino pieno per timeline. */
  pallino: string;
  icona: LucideIcon;
};

const AMBRA = {
  bordoAlto: "border-t-amber-500 dark:border-t-amber-400",
  fascia: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  pallino: "bg-amber-500 dark:bg-amber-400",
  badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  bordo: "border-l-amber-500 dark:border-l-amber-400",
  tinta: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
};
const VERDE = {
  bordoAlto: "border-t-emerald-500 dark:border-t-emerald-400",
  fascia: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  pallino: "bg-emerald-500 dark:bg-emerald-400",
  badge: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  bordo: "border-l-emerald-500 dark:border-l-emerald-400",
  tinta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};
const ROSSO = {
  bordoAlto: "border-t-red-500 dark:border-t-red-400",
  fascia: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  pallino: "bg-red-500 dark:bg-red-400",
  badge: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  bordo: "border-l-red-500 dark:border-l-red-400",
  tinta: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};
const BLU = {
  bordoAlto: "border-t-blue-500 dark:border-t-blue-400",
  fascia: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
  pallino: "bg-blue-500 dark:bg-blue-400",
  badge: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  bordo: "border-l-blue-500 dark:border-l-blue-400",
  tinta: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
};
const VIOLA = {
  bordoAlto: "border-t-violet-500 dark:border-t-violet-400",
  fascia: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900",
  pallino: "bg-violet-500 dark:bg-violet-400",
  badge: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  bordo: "border-l-violet-500 dark:border-l-violet-400",
  tinta: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
};
const AZZURRO = {
  bordoAlto: "border-t-sky-500 dark:border-t-sky-400",
  fascia: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  pallino: "bg-sky-500 dark:bg-sky-400",
  badge: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  bordo: "border-l-sky-500 dark:border-l-sky-400",
  tinta: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
};
const TEAL = {
  bordoAlto: "border-t-teal-500 dark:border-t-teal-400",
  fascia: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900",
  pallino: "bg-teal-500 dark:bg-teal-400",
  badge: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
  bordo: "border-l-teal-500 dark:border-l-teal-400",
  tinta: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
};
const NEUTRO = {
  bordoAlto: "border-t-border",
  fascia: "bg-muted text-muted-foreground border-border",
  pallino: "bg-muted-foreground/30",
  badge: "bg-muted text-muted-foreground border-border",
  bordo: "border-l-border",
  tinta: "bg-muted text-muted-foreground",
};

const ARDESIA = {
  badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
  bordo: "border-l-slate-400 dark:border-l-slate-500",
  tinta: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  bordoAlto: "border-t-slate-400 dark:border-t-slate-500",
  fascia: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
  pallino: "bg-slate-400 dark:bg-slate-500",
};

/** Tinte riusabili per riquadri/intestazioni (nessun significato di stato). */
export const TINTE = { ambra: AMBRA, verde: VERDE, rosso: ROSSO, blu: BLU, viola: VIOLA, azzurro: AZZURRO, teal: TEAL, ardesia: ARDESIA, neutro: NEUTRO };
export type Tinta = keyof typeof TINTE;

export const STILE_STATUS: Record<string, StileVoce> = {
  pending: { label: "In attesa del Responsabile", icona: Hourglass, ...AMBRA },
  forwarded: { label: "In attesa della Direzione", icona: Hourglass, ...AMBRA },
  resp_approved: { label: "Approvata dal Responsabile", icona: CheckCircle2, ...VERDE },
  approved: { label: "Approvata dalla Direzione", icona: CheckCircle2, ...VERDE },
  rejected: { label: "Rifiutata", icona: XCircle, ...ROSSO },
};

export const STILE_ADMIN: Record<string, StileVoce> = {
  da_gestire: { label: "Da gestire", icona: Inbox, ...ROSSO },
  in_gestione: { label: "In gestione", icona: Wrench, ...AMBRA },
  conclusa: { label: "Conclusa", icona: CheckCircle2, ...VERDE },
};

export const STILE_TIPO: Record<string, StileVoce> = {
  preventivo: { label: "Approvazione preventivo", icona: FileText, ...BLU },
  attivita: { label: "Richiesta attività", icona: ClipboardList, ...VIOLA },
  acquisto: { label: "Acquisto materiali/servizi", icona: ShoppingCart, ...AZZURRO },
};

export const STILE_ACCONTO: Record<"in_attesa" | "da_eseguire" | "in_ritardo" | "eseguito" | "annullato", StileVoce> = {
  in_attesa: { label: "In attesa di approvazione", icona: Banknote, ...ARDESIA },
  da_eseguire: { label: "Bonifico da fare", icona: Banknote, ...TEAL },
  in_ritardo: { label: "Bonifico da fare · in ritardo", icona: Banknote, ...AMBRA },
  eseguito: { label: "Bonifico eseguito", icona: CheckCircle2, ...VERDE },
  annullato: { label: "Bonifico annullato", icona: Banknote, ...ARDESIA },
};

const fmtEuroAcconto = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

function oggiIsoLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fonte unica di stile e dicitura dello stato del bonifico di acconto (liste, card, timeline). */
export function statoAcconto(r: {
  status: string;
  acconto_stato?: string | null;
  acconto_importo?: number | null;
  acconto_data_prevista?: string | null;
}): { chiave: keyof typeof STILE_ACCONTO; stile: StileVoce; testo: string } {
  const imp = fmtEuroAcconto(r.acconto_importo);
  if (r.status === "rejected") return { chiave: "annullato", stile: STILE_ACCONTO.annullato, testo: "Bonifico annullato" };
  if (r.acconto_stato === "eseguito") return { chiave: "eseguito", stile: STILE_ACCONTO.eseguito, testo: `Bonifico eseguito · ${imp}` };
  if (r.status !== "resp_approved" && r.status !== "approved") {
    return { chiave: "in_attesa", stile: STILE_ACCONTO.in_attesa, testo: `Bonifico ${imp} · in attesa di approvazione` };
  }
  const ritardo = !!r.acconto_data_prevista && r.acconto_data_prevista.slice(0, 10) < oggiIsoLocale();
  return ritardo
    ? { chiave: "in_ritardo", stile: STILE_ACCONTO.in_ritardo, testo: `Bonifico da fare · ${imp} · in ritardo` }
    : { chiave: "da_eseguire", stile: STILE_ACCONTO.da_eseguire, testo: `Bonifico da fare · ${imp}` };
}

/** Stile "Aperte" (da gestire + in gestione) per i contatori della Gestione. */
export const STILE_APERTE: StileVoce = { label: "Aperte", icona: Inbox, ...BLU };

/** Intestazioni di pagina della sezione. */
export const STILE_PAGINA = {
  dashboard: { label: "Richieste interne", icona: LayoutDashboard, ...BLU },
  mie: { label: "Le mie richieste", icona: Inbox, ...BLU },
  tutte: { label: "Tutte le richieste", icona: ListChecks, ...VIOLA },
  approva: { label: "Da approvare", icona: Hourglass, ...AMBRA },
  gestione: { label: "Gestione richieste", icona: Wrench, ...ROSSO },
  archivio: { label: "Archivio richieste", icona: Archive, ...ARDESIA },
  dettaglio: { label: "Richiesta", icona: FileText, ...BLU },
} satisfies Record<string, StileVoce>;

/** Pulsanti di decisione nella card Azioni. */
export const STILE_DECISIONE = {
  approva: { label: "Approva", icona: CheckCircle2, ...VERDE },
  inoltra: { label: "Inoltra alla Direzione", icona: Send, ...BLU },
  rifiuta: { label: "Rifiuta", icona: XCircle, ...ROSSO },
} satisfies Record<string, StileVoce>;

/** Passo "Creata" e passi futuri della timeline. */
export const STILE_CREATA: StileVoce = { label: "Creata", icona: FilePlus2, ...BLU };
export const STILE_IN_ATTESA: StileVoce = { label: "In attesa", icona: Circle, ...NEUTRO };
export const STILE_ARCHIVIATA: StileVoce = { label: "Archiviata", icona: Archive, ...ARDESIA };

export const STILE_ALLEGATI: StileVoce = { label: "Allegati", icona: Paperclip, ...ARDESIA };
export const STILE_AZIONI: StileVoce = { label: "Azioni", icona: ClipboardCheck, ...BLU };

export const STILE_NEUTRO: StileVoce = { label: "—", icona: FileText, ...NEUTRO };

const etichette = (m: Record<string, StileVoce>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.label])) as Record<string, string>;

export const STATUS_LABEL: Record<string, string> = etichette(STILE_STATUS);
export const ADMIN_LABEL: Record<string, string> = etichette(STILE_ADMIN);
export const TIPO_LABEL: Record<string, string> = etichette(STILE_TIPO);

export const stileStatus = (s: string | null | undefined): StileVoce =>
  (s && STILE_STATUS[s]) || { ...STILE_NEUTRO, label: s ?? "—" };
export const stileAdmin = (s: string | null | undefined): StileVoce =>
  STILE_ADMIN[s ?? "da_gestire"] ?? STILE_ADMIN.da_gestire;
export const stileTipo = (t: string | null | undefined): StileVoce =>
  (t && STILE_TIPO[t]) || { ...STILE_NEUTRO, label: t ?? "—" };

/**
 * Stile principale di una richiesta (bordo sinistro di schede e righe):
 * rifiutata → rosso; in attesa → ambra; approvata → colore di admin_status.
 */
export function stilePrincipale(r: { status: string; admin_status?: string | null }): StileVoce {
  if (r.status === "resp_approved" || r.status === "approved") return stileAdmin(r.admin_status);
  return stileStatus(r.status);
}
