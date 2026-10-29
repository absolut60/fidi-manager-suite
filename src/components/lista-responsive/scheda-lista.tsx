import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

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
  selezione,
}: {
  /** Se omesso la scheda è un contenitore statico (necessario quando contiene elementi interattivi). */
  onClick?: () => void;
  titolo: ReactNode;
  badge?: ReactNode;
  campi: CampoScheda[];
  footer?: ReactNode;
  colonneCampi?: 1 | 2;
  className?: string;
  selezione?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  // Mai un <button> come wrapper: la scheda può contenere elementi interattivi
  // (checkbox) e il nesting di bottoni è HTML non valido → mismatch di idratazione.
  return (
    <div
      {...(onClick
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={cn(
        "w-full text-left rounded-lg border bg-card p-4",
        onClick && "cursor-pointer active:bg-muted/50",
        className,
      )}
    >

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {selezione && (
            <span
              className="shrink-0 pt-0.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selezione.checked}
                onCheckedChange={(v) => selezione.onChange(v === true)}
              />
            </span>
          )}
          <span className="font-medium text-base min-w-0 break-words">{titolo}</span>
        </div>
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
    </div>
  );
}

export type SelezioneTutti = {
  tutti: boolean;
  alcuni?: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  /** Testo mostrato quando non tutte sono selezionate, es. "Seleziona tutte (12)". */
  etichetta?: string;
};

/** Contenitore delle schede: visibile solo sotto `md`. La tabella va avvolta in `hidden md:block`. */
export function ElencoSchede({ children, selezioneTutti }: { children: ReactNode; selezioneTutti?: SelezioneTutti }) {
  if (!selezioneTutti) return <div className="md:hidden space-y-2">{children}</div>;
  const s = selezioneTutti;
  const stato = s.tutti ? true : s.alcuni ? "indeterminate" : false;
  return (
    <div className="md:hidden space-y-2">
      <label
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm",
          s.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={stato}
          disabled={s.disabled}
          onCheckedChange={() => s.onChange(!s.tutti)}
          className="h-5 w-5 shrink-0"
        />
        <span className="min-w-0 break-words">{s.tutti ? "Deseleziona tutte" : (s.etichetta ?? "Seleziona tutte")}</span>
      </label>
      {children}
    </div>
  );
}
