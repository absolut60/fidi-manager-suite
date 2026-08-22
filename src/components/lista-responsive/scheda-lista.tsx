import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CampoScheda = { etichetta: string; valore: ReactNode };

/**
 * Scheda uniforme usata al posto della riga di tabella sotto il breakpoint `md`.
 */
export function SchedaLista({
  onClick,
  titolo,
  badge,
  campi,
  footer,
  colonneCampi = 1,
  className,
}: {
  /** Se omesso la scheda è un contenitore statico (necessario quando contiene elementi interattivi). */
  onClick?: () => void;
  titolo: ReactNode;
  badge?: ReactNode;
  campi: CampoScheda[];
  footer?: ReactNode;
  colonneCampi?: 1 | 2;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "w-full text-left rounded-lg border bg-card p-4",
        onClick && "active:bg-muted/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-base min-w-0 break-words">{titolo}</span>
        {badge}
      </div>


      {campi.length > 0 && (
        <div
          className={cn(
            "mt-3 grid gap-x-4 gap-y-1.5 text-sm",
            colonneCampi === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {campi.map((c) => (
            <div key={c.etichetta} className="min-w-0 break-words">
              <span className="text-muted-foreground">{c.etichetta}: </span>
              {c.valore}
            </div>
          ))}
        </div>
      )}

      {footer && <div className="mt-2 flex flex-wrap items-center gap-1.5">{footer}</div>}
    </Comp>
  );
}

/** Contenitore delle schede: visibile solo sotto `md`. La tabella va avvolta in `hidden md:block`. */
export function ElencoSchede({ children }: { children: ReactNode }) {
  return <div className="md:hidden space-y-2">{children}</div>;
}
