import { cn } from "@/lib/utils";

/**
 * FM84: piccolo gauge stilizzato (semicerchio con lancetta) che segnala che il cliente
 * ha almeno un Light Report Cerved. Solo visuale, colore neutro: nessun giudizio di rischio.
 * Se `onApri` è presente il simbolo è cliccabile (apre la scheda cliente sul tab Cerved).
 */
export function IconaCervedCollegato({
  onApri,
  className,
}: {
  onApri?: () => void;
  className?: string;
}) {
  const svg = (
    <svg viewBox="0 0 24 15" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M3.5 12.5 A 8.5 8.5 0 0 1 20.5 12.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="12.5"
        x2="16.2"
        y2="6.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12.5" r="1.6" fill="currentColor" />
    </svg>
  );
  if (!onApri) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center text-muted-foreground", className)}
        title="Collegato a Cerved"
        role="img"
        aria-label="Collegato a Cerved"
      >
        {svg}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onApri();
      }}
      className={cn(
        "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary",
        className,
      )}
      title="Collegato a Cerved"
      aria-label="Collegato a Cerved: apri la scheda Cerved del cliente"
    >
      {svg}
    </button>
  );
}
