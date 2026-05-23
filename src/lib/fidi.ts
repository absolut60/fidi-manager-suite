import type { Database } from "@/integrations/supabase/types";

export type StatoRichiesta = Database["public"]["Enums"]["stato_richiesta"];
export type TipoRichiesta = Database["public"]["Enums"]["tipo_richiesta"];

export const TIPO_LABEL: Record<TipoRichiesta, string> = {
  nuovo: "Nuovo fido",
  nuovo_fido: "Nuovo fido",
  aumento: "Aumento fido",
  diminuzione: "Diminuzione fido",
  rinnovo: "Rinnovo fido",
};

export const TIPO_TONE: Record<TipoRichiesta, string> = {
  nuovo: "bg-primary/10 text-primary",
  nuovo_fido: "bg-primary/10 text-primary",
  aumento: "bg-success/15 text-success",
  diminuzione: "bg-warning/15 text-warning",
  rinnovo: "bg-info/15 text-info",
};

export const STATO_LABEL: Record<StatoRichiesta, string> = {
  bozza: "Bozza",
  in_approvazione: "In approvazione",
  in_attesa_liv1: "In attesa Liv. 1",
  in_attesa_liv2: "In attesa Liv. 2",
  in_attesa_liv3: "In attesa Liv. 3",
  integrazioni_richieste: "Integrazioni richieste",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
  annullata: "Annullata",
};

export const STATO_TONE: Record<StatoRichiesta, string> = {
  bozza: "bg-muted text-muted-foreground",
  in_approvazione: "bg-info/15 text-info",
  in_attesa_liv1: "bg-info/15 text-info",
  in_attesa_liv2: "bg-info/15 text-info",
  in_attesa_liv3: "bg-info/15 text-info",
  integrazioni_richieste: "bg-warning/15 text-warning",
  approvata: "bg-success/15 text-success",
  rifiutata: "bg-destructive/15 text-destructive",
  annullata: "bg-muted text-muted-foreground",
};

export type SoglieFido = { liv1: number; liv2: number };
export const SOGLIE_DEFAULT: SoglieFido = { liv1: 10000, liv2: 50000 };

export function calcolaLivello(importo: number, soglie: SoglieFido = SOGLIE_DEFAULT): 1 | 2 | 3 {
  if (importo <= soglie.liv1) return 1;
  if (importo <= soglie.liv2) return 2;
  return 3;
}

export function livelloLabel(liv: number, soglie: SoglieFido = SOGLIE_DEFAULT): string {
  if (liv === 1) return `Liv. 1 (≤ ${formatEuroCompact(soglie.liv1)})`;
  if (liv === 2) return `Liv. 2 (≤ ${formatEuroCompact(soglie.liv2)})`;
  return `Liv. 3 (> ${formatEuroCompact(soglie.liv2)})`;
}

// retro-compatibilità: alcune view usano ancora la mappa statica
export const LIVELLO_LABEL: Record<number, string> = {
  1: livelloLabel(1),
  2: livelloLabel(2),
  3: livelloLabel(3),
};

function formatEuroCompact(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

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
