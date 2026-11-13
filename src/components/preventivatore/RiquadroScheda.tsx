import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToniRiquadro = "grigio" | "azzurro" | "arancio" | "verde" | "viola";
const TONI: Record<ToniRiquadro, { box: string; icona: string }> = {
  grigio: { box: "border-border bg-pv-grigio-tenue/60", icona: "bg-muted-foreground" },
  azzurro: { box: "border-pv-azzurro-bordo bg-pv-azzurro/60", icona: "bg-pv-blu" },
  arancio: { box: "border-pv-arancio/25 bg-pv-arancio-tenue/60", icona: "bg-pv-arancio" },
  verde: { box: "border-pv-verde/25 bg-pv-verde-tenue/60", icona: "bg-pv-verde" },
  viola: { box: "border-pv-viola/25 bg-pv-viola-tenue/60", icona: "bg-pv-viola" },
};

/** Riquadro colorato con intestazione (icona quadrata + titolo) per Testata e Piede del preventivo. */
export function RiquadroScheda({ titolo, icona: Icona, tono, className, children }: { titolo: string; icona: LucideIcon; tono: ToniRiquadro; className?: string; children: ReactNode }) {
  const t = TONI[tono];
  return <section className={cn("min-w-0 rounded-[12px] border p-3 sm:p-4", t.box, className)}>
    <header className="mb-3 flex items-center gap-2">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-md text-primary-foreground", t.icona)}><Icona className="size-4" aria-hidden /></span>
      <h3 className="min-w-0 break-words text-sm font-bold">{titolo}</h3>
    </header>
    {children}
  </section>;
}
