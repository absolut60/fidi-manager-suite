import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FidoTeoricoRow } from "@/lib/fido-teorico";
import { segnalazioniRiga, type GravitaSegnalazione } from "@/lib/fido-segnalazioni";

const CLASSE: Record<GravitaSegnalazione, string> = {
  rossa: "border-destructive/40 bg-destructive/10 text-destructive",
  arancione: "border-warning/50 bg-warning/15 text-foreground",
  info: "border-info/40 bg-info/10 text-info",
};

/** FM55 — unico componente per mostrare le segnalazioni del fido (badge + testo completo). */
export function SegnalazioniFido({ riga }: { riga: FidoTeoricoRow }) {
  const isMobile = useIsMobile();
  const lista = segnalazioniRiga(riga);
  if (lista.length === 0) return null;

  if (isMobile) {
    return (
      <ul className="min-w-0 space-y-1" aria-label="Segnalazioni del fido">
        {lista.map((s) => (
          <li key={s.codice} className={`rounded-md border px-2 py-1 text-xs break-words ${CLASSE[s.gravita]}`}>
            {s.testo}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Segnalazioni del fido">
      {lista.map((s) => (
        <Tooltip key={s.codice}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-help ${CLASSE[s.gravita]}`}
            >
              {s.etichetta}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-words">{s.testo}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
