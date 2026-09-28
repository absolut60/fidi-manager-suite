// Badge dello stadio di sollecito di un cliente (fonte unica:
// usato in recupero-crediti.tsx e nella striscia recupero dello scadenziario).
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const STADIO_LABEL: Record<number, string> = {
  0: "Mai sollecitato",
  1: "1° sollecito",
  2: "2° sollecito",
  3: "Messa in mora",
};

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
  const cls =
    s === 0
      ? "bg-muted text-muted-foreground hover:bg-muted"
      : s === 1
        ? "bg-blue-500 text-white hover:bg-blue-500"
        : s === 2
          ? "bg-orange-500 text-white hover:bg-orange-500"
          : "bg-destructive text-destructive-foreground hover:bg-destructive";
  return (
    <Badge className={cn("whitespace-nowrap", cls)}>
      {STADIO_LABEL[s]}{suffix}
    </Badge>
  );
}
