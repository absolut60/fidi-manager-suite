import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Intestazione filtri unificata per le liste.
 * - sotto `md`: intestazione cliccabile con icona + chevron, contenuto a scomparsa (chiuso di default)
 * - da `md` in su: nessuna interazione, contenuto SEMPRE visibile (identico al desktop attuale)
 */
export function FiltriCollassabili({
  attivi = 0,
  azioni,
  children,
}: {
  attivi?: number;
  azioni?: ReactNode;
  children: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground md:pointer-events-none"
        >
          <SlidersHorizontal className="size-4 md:hidden" />
          Filtri
          <ChevronDown
            className={`size-4 md:hidden transition-transform ${aperto ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex items-center gap-2">
          {attivi > 0 && (
            <Badge variant="secondary" className="h-6">
              {attivi} {attivi === 1 ? "filtro attivo" : "filtri attivi"}
            </Badge>
          )}
          {attivi > 0 && azioni}
        </div>
      </div>

      <div className={`${aperto ? "block" : "hidden"} md:block mb-4`}>{children}</div>
    </div>
  );
}
