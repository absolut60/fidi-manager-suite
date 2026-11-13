import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiquadroAnagrafica, TONI_ANAGRAFICA } from "@/components/ui/riquadro-anagrafica";

export type ToniRiquadro = "grigio" | "azzurro" | "arancio" | "verde" | "viola";
/** Intestazione del preventivo sulla cornice condivisa con le anagrafiche. */
export function RiquadroScheda({ titolo, icona: Icona, tono, className, children }: { titolo: string; icona: LucideIcon; tono: ToniRiquadro; className?: string; children: ReactNode }) {
  return <RiquadroAnagrafica tono={tono} className={className} role="region" aria-label={titolo}>
    <header className="mb-3 flex items-center gap-2">
      <span className={cn("grid size-7 shrink-0 place-items-center", TONI_ANAGRAFICA[tono].testo)}><Icona className="size-4" aria-hidden /></span>
      <h3 className="min-w-0 break-words text-sm font-bold">{titolo}</h3>
    </header>
    {children}
  </RiquadroAnagrafica>;
}
