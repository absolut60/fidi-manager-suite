import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EVASIONE_LABEL, type StatoEvasione } from "@/lib/evasione";

/**
 * Badge per lo stato di evasione di un preventivo.
 * - aperto    → neutro (outline)
 * - parziale  → arancione
 * - evaso     → verde
 */
export function EvasioneBadge({
  stato,
  className,
}: {
  stato: StatoEvasione;
  className?: string;
}) {
  const styles: Record<StatoEvasione, string> = {
    aperto: "border-muted-foreground/30 bg-muted text-muted-foreground",
    parziale:
      "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    evaso:
      "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  };
  return (
    <Badge variant="outline" className={cn(styles[stato], className)}>
      {EVASIONE_LABEL[stato]}
    </Badge>
  );
}
