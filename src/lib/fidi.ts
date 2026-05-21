import type { Database } from "@/integrations/supabase/types";

export type StatoRichiesta = Database["public"]["Enums"]["stato_richiesta"];

export const STATO_LABEL: Record<StatoRichiesta, string> = {
  bozza: "Bozza",
  in_approvazione: "In approvazione",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
  annullata: "Annullata",
};

export const STATO_TONE: Record<StatoRichiesta, string> = {
  bozza: "bg-muted text-muted-foreground",
  in_approvazione: "bg-info/15 text-info",
  approvata: "bg-success/15 text-success",
  rifiutata: "bg-destructive/15 text-destructive",
  annullata: "bg-muted text-muted-foreground",
};

export function calcolaLivello(importo: number): 1 | 2 | 3 {
  if (importo <= 10000) return 1;
  if (importo <= 50000) return 2;
  return 3;
}

export const LIVELLO_LABEL: Record<number, string> = {
  1: "Liv. 1 (≤ 10.000 €)",
  2: "Liv. 2 (≤ 50.000 €)",
  3: "Liv. 3 (> 50.000 €)",
};

export function formatEuro(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
