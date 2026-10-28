// Badge dello stadio di sollecito di un cliente (fonte unica:
// usato in recupero-crediti.tsx e nella striscia recupero dello scadenziario).
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const STADIO_LABEL: Record<number, string> = {
  0: "Mai sollecitato",
  1: "1° sollecito",
  2: "2° sollecito",
  3: "Messa in mora",
};

const STADIO_LABEL_BREVE: Record<number, string> = { 1: "1°", 2: "2°", 3: "Mora" };

/** Colori per livello: 1° blu, 2° arancione, Messa in mora rosso. */
export function classeStadioSollecito(stadio: number): string {
  const s = Number(stadio ?? 0);
  return s === 0
    ? "bg-muted text-muted-foreground hover:bg-muted"
    : s === 1
      ? "bg-blue-500 text-white hover:bg-blue-500"
      : s === 2
        ? "bg-orange-500 text-white hover:bg-orange-500"
        : "bg-destructive text-destructive-foreground hover:bg-destructive";
}

export function StadioSollecitoBadge({ stadio, data, giorni }: {
  stadio: number;
  data: string | null;
  giorni: number | null;
}) {
  const s = Number(stadio ?? 0);
  const dataStr = data
    ? new Date(data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
    : null;
  const suffix = dataStr ? ` — ${dataStr}${giorni != null ? ` (da ${giorni} gg)` : ""}` : "";
  return (
    <Badge className={cn("whitespace-nowrap", classeStadioSollecito(s))}>
      {STADIO_LABEL[s]}{suffix}
    </Badge>
  );
}

/** Badge compatto ("1°", "2°", "Mora") con tooltip; trattino se stadio 0. */
export function StadioSollecitoBadgeCompatto({ stadio, data, giorni }: {
  stadio: number;
  data: string | null;
  giorni: number | null;
}) {
  const s = Number(stadio ?? 0);
  if (!s) return <span className="text-muted-foreground">—</span>;
  const dataStr = data
    ? new Date(data).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
  const testo = `${STADIO_LABEL[s]} del ${dataStr}${giorni != null ? ` — da ${giorni} gg` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn("whitespace-nowrap text-[10px] px-1.5 h-5", classeStadioSollecito(s))} aria-label={testo}>
          {STADIO_LABEL_BREVE[s]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{testo}</TooltipContent>
    </Tooltip>
  );
}
