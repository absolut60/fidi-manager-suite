import type { Database } from "@/integrations/supabase/types";

export type LeadStato = Database["public"]["Enums"]["lead_stato"];
export type LeadTipo = Database["public"]["Enums"]["lead_tipo"];
export type LeadFonte = Database["public"]["Enums"]["lead_fonte"];
export type LeadPriorita = Database["public"]["Enums"]["lead_priorita"];
export type LeadRichiestaTipo = Database["public"]["Enums"]["lead_richiesta_tipo"];
export type LeadRichiestaStato = Database["public"]["Enums"]["lead_richiesta_stato"];

/** Stessi ruoli della funzione DB can_access_lead(). */
export const LEAD_ROLES = new Set<string>([
  "amministratore",
  "amministrazione",
  "direzione",
  "marketing",
]);

export function puoAccedereLead(roles: readonly string[]): boolean {
  return roles.some((r) => LEAD_ROLES.has(r));
}

export const LEAD_STATI: LeadStato[] = [
  "nuovo",
  "assegnato",
  "in_lavorazione",
  "qualificato",
  "convertito",
  "perso",
];

export const LEAD_STATO_LABEL: Record<LeadStato, string> = {
  nuovo: "Nuovo",
  assegnato: "Assegnato",
  in_lavorazione: "In lavorazione",
  qualificato: "Qualificato",
  convertito: "Convertito",
  perso: "Perso",
};

export const LEAD_STATO_CLASS: Record<LeadStato, string> = {
  nuovo: "bg-primary/15 text-primary",
  assegnato: "bg-blue-500/15 text-blue-600",
  in_lavorazione: "bg-amber-500/15 text-amber-600",
  qualificato: "bg-violet-500/15 text-violet-600",
  convertito: "bg-success/15 text-success",
  perso: "bg-destructive/15 text-destructive",
};

/**
 * Macchina a stati del lead: unica fonte di verità per le transizioni ammesse.
 * "convertito" non è raggiungibile dalla UI (strato dedicato successivo).
 */
export const TRANSIZIONI_AMMESSE: Record<LeadStato, LeadStato[]> = {
  nuovo: ["assegnato", "in_lavorazione", "perso"],
  assegnato: ["in_lavorazione", "qualificato", "perso"],
  in_lavorazione: ["qualificato", "perso"],
  qualificato: ["perso"],
  convertito: [],
  perso: ["nuovo"],
};

export function transizioniDa(stato: LeadStato): LeadStato[] {
  return TRANSIZIONI_AMMESSE[stato] ?? [];
}

export function transizioneAmmessa(da: LeadStato, a: LeadStato): boolean {
  return transizioniDa(da).includes(a);
}


export const LEAD_TIPI: LeadTipo[] = ["potenziale_cliente", "richiesta_specifica"];
export const LEAD_TIPO_LABEL: Record<LeadTipo, string> = {
  potenziale_cliente: "Potenziale cliente",
  richiesta_specifica: "Richiesta specifica",
};

export const LEAD_FONTI: LeadFonte[] = ["web", "hubspot", "manuale", "fiera", "evento", "altro"];
export const LEAD_FONTE_LABEL: Record<LeadFonte, string> = {
  web: "Web",
  hubspot: "HubSpot",
  manuale: "Manuale",
  fiera: "Fiera",
  evento: "Evento",
  altro: "Altro",
};

export const LEAD_PRIORITA: LeadPriorita[] = ["alta", "media", "bassa"];
export const LEAD_PRIORITA_LABEL: Record<LeadPriorita, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};
export const LEAD_PRIORITA_CLASS: Record<LeadPriorita, string> = {
  alta: "bg-destructive/15 text-destructive",
  media: "bg-amber-500/15 text-amber-600",
  bassa: "bg-muted text-muted-foreground",
};

export const LEAD_RICHIESTA_TIPO_LABEL: Record<LeadRichiestaTipo, string> = {
  preventivo: "Preventivo",
  ristrutturazione: "Ristrutturazione",
  info_tecnica: "Info tecnica",
  info_commerciale: "Info commerciale",
};

export const LEAD_RICHIESTA_STATO_LABEL: Record<LeadRichiestaStato, string> = {
  aperta: "Aperta",
  in_lavorazione: "In lavorazione",
  evasa: "Evasa",
  respinta: "Respinta",
};

export function nomeLead(l: {
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
}): string {
  if (l.ragione_sociale?.trim()) return l.ragione_sociale.trim();
  const pf = `${l.nome ?? ""} ${l.cognome ?? ""}`.trim();
  return pf || "(senza nome)";
}

export function formatData(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("it-IT");
}
