// Fonte unica di etichette, colori e icone per le Richieste interne.
// Solo presentazione: nessuna regola di permesso o di business vive qui.
import {
  Banknote, CheckCircle2, ClipboardList, Hourglass, Inbox, ShoppingCart, Wrench, XCircle, FileText,
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
  icona: LucideIcon;
};

const AMBRA = {
  badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  bordo: "border-l-amber-500 dark:border-l-amber-400",
  tinta: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
};
const VERDE = {
  badge: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  bordo: "border-l-emerald-500 dark:border-l-emerald-400",
  tinta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};
const ROSSO = {
  badge: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  bordo: "border-l-red-500 dark:border-l-red-400",
  tinta: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};
const BLU = {
  badge: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  bordo: "border-l-blue-500 dark:border-l-blue-400",
  tinta: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
};
const VIOLA = {
  badge: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  bordo: "border-l-violet-500 dark:border-l-violet-400",
  tinta: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
};
const AZZURRO = {
  badge: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  bordo: "border-l-sky-500 dark:border-l-sky-400",
  tinta: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
};
const TEAL = {
  badge: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
  bordo: "border-l-teal-500 dark:border-l-teal-400",
  tinta: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
};
const NEUTRO = {
  badge: "bg-muted text-muted-foreground border-border",
  bordo: "border-l-border",
  tinta: "bg-muted text-muted-foreground",
};

export const STILE_STATUS: Record<string, StileVoce> = {
  pending: { label: "In attesa Liv.1", icona: Hourglass, ...AMBRA },
  forwarded: { label: "In attesa Direzione", icona: Hourglass, ...AMBRA },
  resp_approved: { label: "Approvata Liv.1", icona: CheckCircle2, ...VERDE },
  approved: { label: "Approvata", icona: CheckCircle2, ...VERDE },
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

export const STILE_ACCONTO: Record<"da_eseguire" | "eseguito", StileVoce> = {
  da_eseguire: { label: "Acconto da eseguire", icona: Banknote, ...TEAL },
  eseguito: { label: "✓ Acconto eseguito", icona: CheckCircle2, ...VERDE },
};

/** Stile "Aperte" (da gestire + in gestione) per i contatori della Gestione. */
export const STILE_APERTE: StileVoce = { label: "Aperte", icona: Inbox, ...BLU };

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
