import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiquadroAnagrafica, TONI_ANAGRAFICA } from "@/components/ui/riquadro-anagrafica";

export type ToniRiquadro = "grigio" | "azzurro" | "arancio" | "verde" | "viola";
/** Intestazione del preventivo sulla cornice condivisa con le anagrafiche. */
export function RiquadroScheda({ titolo, icona: Icona, tono, className, children, densita = "normale", intestazione }: { titolo: string; icona: LucideIcon; tono: ToniRiquadro; className?: string; children: ReactNode; densita?: "normale" | "compatta"; intestazione?: ReactNode }) {
  const compatta = densita === "compatta";
  return <RiquadroAnagrafica tono={tono} className={cn(compatta && "p-2.5 sm:p-2.5", className)} role="region" aria-label={titolo}>
    <header className={cn("flex items-center gap-2", compatta ? "mb-1.5" : "mb-3")}>
      <span className={cn("grid shrink-0 place-items-center", compatta ? "size-4" : "size-7", TONI_ANAGRAFICA[tono].testo)}><Icona className="size-4" aria-hidden /></span>
      {intestazione ? <div className="min-w-0 flex-1">{intestazione}</div> : <h3 className={cn("min-w-0 break-words", compatta ? "text-xs font-semibold" : "text-sm font-bold")}>{titolo}</h3>}
    </header>
    {children}
  </RiquadroAnagrafica>;
}
