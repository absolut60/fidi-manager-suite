import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AzioneRiquadro({ icona: Icona, etichetta, onClick }: { icona: LucideIcon; etichetta: string; onClick: () => void }) {
  return <TooltipProvider delayDuration={250}><Tooltip><TooltipTrigger asChild>
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={etichetta} onClick={onClick}><Icona className="size-4" aria-hidden/></Button>
  </TooltipTrigger><TooltipContent>{etichetta}</TooltipContent></Tooltip></TooltipProvider>;
}