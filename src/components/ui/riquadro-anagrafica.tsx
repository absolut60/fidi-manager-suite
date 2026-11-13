import type { ComponentProps } from "react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

export type TonoAnagrafica = "grigio" | "azzurro" | "arancio" | "verde" | "viola" | "neutro" | "primary";
export const TONI_ANAGRAFICA: Record<TonoAnagrafica, { bordo: string; testo: string }> = {
  grigio: { bordo: "border-l-muted-foreground", testo: "text-muted-foreground" },
  azzurro: { bordo: "border-l-pv-blu", testo: "text-pv-blu" },
  arancio: { bordo: "border-l-pv-arancio", testo: "text-pv-arancio" },
  verde: { bordo: "border-l-pv-verde", testo: "text-pv-verde" },
  viola: { bordo: "border-l-pv-viola", testo: "text-pv-viola" },
  neutro: { bordo: "border-l-border", testo: "text-muted-foreground" },
  primary: { bordo: "border-l-primary", testo: "text-primary" },
};

/** Cornice unica delle sezioni anagrafiche e del preventivo. */
export function RiquadroAnagrafica({ tono, className, ...props }: ComponentProps<typeof Card> & { tono: TonoAnagrafica }) {
  return <Card {...props} className={cn("min-w-0 rounded-l-none rounded-r-lg border-[0.5px] border-l-[3px] bg-card p-3 sm:p-4", TONI_ANAGRAFICA[tono].bordo, className)} />;
}