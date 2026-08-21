import { cn } from "@/lib/utils";
import type { StatoArticolo } from "@/lib/articoli-api";

export function StatoBadge({ stato }: { stato: StatoArticolo }) {
  const isAttivo = stato === "attivo";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isAttivo
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800",
      )}
    >
      {stato}
    </span>
  );
}
