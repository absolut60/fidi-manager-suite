import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Intestazione filtri unificata per le liste.
 * - sotto `md`: intestazione cliccabile con icona + chevron, contenuto a scomparsa (chiuso di default)
 * - da `md` in su: nessuna interazione, contenuto SEMPRE visibile (identico al desktop attuale)
 */
export function FiltriCollassabili({
  attivi = 0,
  azioni,
  children,
  ancheDesktop = false,
  riepilogo,
}: {
  attivi?: number;
  azioni?: ReactNode;
  children: ReactNode;
  ancheDesktop?: boolean;
  riepilogo?: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <div>
      {/* Sotto md: intestazione cliccabile */}
      <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 ${ancheDesktop ? "" : "mb-3 md:hidden"}`}>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={aperto}
          onClick={() => setAperto((v) => !v)}
          className="h-10 px-1 gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <SlidersHorizontal className="size-4" />
          Filtri
          <ChevronDown
            className={`size-4 transition-transform ${aperto ? "rotate-180" : ""}`}
          />
        </Button>
        <div className="min-w-0 flex flex-wrap items-center justify-end gap-2">
          {riepilogo}
          {attivi > 0 && (
            <Badge variant="secondary" className="h-6">
              {attivi} {attivi === 1 ? "filtro attivo" : "filtri attivi"}
            </Badge>
          )}
          {attivi > 0 && azioni}
        </div>
      </div>

      {/* Da md in su: nessuna intestazione, solo le azioni (se previste) */}
      {!ancheDesktop && azioni && attivi > 0 && (
        <div className="hidden md:flex items-center justify-end gap-2 mb-3">
          <Badge variant="secondary" className="h-6">
            {attivi} {attivi === 1 ? "filtro attivo" : "filtri attivi"}
          </Badge>
          {azioni}
        </div>
      )}

      <div className={`${aperto ? "block" : "hidden"} ${ancheDesktop ? "max-h-[30dvh] overflow-y-auto pt-2" : "md:block mb-4"}`}>{children}</div>
    </div>
  );
}

