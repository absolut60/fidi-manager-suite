import type { Database } from "@/integrations/supabase/types";

export type EventiPartecipanteStato = Database["public"]["Enums"]["eventi_partecipante_stato"];

export const EVENTI_PARTECIPANTE_STATI: EventiPartecipanteStato[] = [
  "atteso",
  "confermato",
  "presentato",
  "no_show",
];

export const EVENTI_PARTECIPANTE_STATO_LABEL: Record<EventiPartecipanteStato, string> = {
  atteso: "Atteso",
  confermato: "Confermato",
  presentato: "Presentato",
  no_show: "No show",
};

export const EVENTI_PARTECIPANTE_STATO_CLASS: Record<EventiPartecipanteStato, string> = {
  atteso: "bg-muted text-muted-foreground",
  confermato: "bg-blue-500/15 text-blue-600",
  presentato: "bg-success/15 text-success",
  no_show: "bg-destructive/15 text-destructive",
};

/** Etichetta identità di un partecipante a partire dai dati grezzi. */
export function nomePartecipante(p: {
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
}): string {
  const rs = p.ragione_sociale?.trim();
  if (rs) return rs;
  const full = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  return full || "—";
}

export function formatDataEvento(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("it-IT");
}
