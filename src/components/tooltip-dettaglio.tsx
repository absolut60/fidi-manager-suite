import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Contenuto montato solo all'apertura; Radix ignora il puntatore touch. */
export function TooltipDettaglio({ children, contenuto, side = "top" }: {
  children: ReactNode;
  contenuto: () => ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={aperto} onOpenChange={setAperto}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className="max-w-[min(320px,calc(100vw-24px))] whitespace-normal break-words">
          {aperto && contenuto()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}