// FM62 F7: unico segno grafico del fornitore convenzionato (bandierina italiana ~16×11 px).
// Colori della bandiera fissi per definizione, non temi. Tooltip "Convenzionato" al passaggio e al tocco.
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function BandierinaConvenzionato({ className }: { className?: string }) {
  const [aperto, setAperto] = useState(false);
  return <TooltipProvider delayDuration={150}><Tooltip open={aperto} onOpenChange={setAperto}>
    <TooltipTrigger asChild>
      <button type="button" aria-label="Convenzionato" title="Convenzionato"
        onClick={e => { e.stopPropagation(); e.preventDefault(); setAperto(v => !v); }}
        className={`inline-flex shrink-0 items-center justify-center p-1 align-middle ${className ?? ""}`}>
        <span aria-hidden className="inline-flex h-[11px] w-4 overflow-hidden rounded-[2px] ring-1 ring-border">
          <span className="h-full w-1/3" style={{ backgroundColor: "#009246" }} />
          <span className="h-full w-1/3" style={{ backgroundColor: "#FFFFFF" }} />
          <span className="h-full w-1/3" style={{ backgroundColor: "#CE2B37" }} />
        </span>
      </button>
    </TooltipTrigger>
    <TooltipContent>Convenzionato</TooltipContent>
  </Tooltip></TooltipProvider>;
}
