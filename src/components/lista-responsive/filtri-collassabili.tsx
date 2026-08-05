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
      {/* Sotto md: intestazione cliccabile */}
      <div className="flex items-center justify-between gap-2 mb-3 md:hidden">
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <SlidersHorizontal className="size-4" />
          Filtri
          <ChevronDown
            className={`size-4 transition-transform ${aperto ? "rotate-180" : ""}`}
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

      {/* Da md in su: nessuna intestazione, solo le azioni (se previste) */}
      {azioni && attivi > 0 && (
        <div className="hidden md:flex items-center justify-end gap-2 mb-3">
          <Badge variant="secondary" className="h-6">
            {attivi} {attivi === 1 ? "filtro attivo" : "filtri attivi"}
          </Badge>
          {azioni}
        </div>
      )}

      <div className={`${aperto ? "block" : "hidden"} md:block mb-4`}>{children}</div>
    </div>
  );
}

