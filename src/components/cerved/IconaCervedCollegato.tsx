import { cn } from "@/lib/utils";
import { SETTORI_GAUGE_CERVED, settoreIconaCervedLista } from "@/lib/cerved-presentazione";
import { formatNumeroIt } from "@/lib/numero-it";

/** Testo di tooltip/aria-label del simbolo Cerved nella lista clienti. */
export function etichettaCervedLista(classe: number | null, score: number | null): string {
  if (classe == null) return "Collegato a Cerved";
  return `Cerved: classe CGS_${classe}${score != null ? `, score ${formatNumeroIt(score)}` : ""}`;
}

/**
 * FM84: mini gauge Cerved (semicerchio a 8 settori con i colori del gauge della scheda,
 * fonte unica SETTORI_GAUGE_CERVED) con lancetta sul settore dello score CGS, calcolato
 * con la stessa funzione della scheda (settoreGaugeCerved); ripiego sulla classe solo
 * senza score. Classe mancante: semicerchio grigio senza lancetta.
 */
export function IconaCervedCollegato({
  classe = null,
  score = null,
  onApri,
  className,
}: {
  classe?: number | null;
  score?: number | null;
  onApri?: () => void;
  className?: string;
}) {
  const settore = settoreIconaCervedLista(score, classe);
  const cx = 12, cy = 12.5, r = 9;
  const pt = (deg: number, rr: number) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy - rr * Math.sin((deg * Math.PI) / 180)];
  const amp = 180 / 8;
  const etichetta = etichettaCervedLista(classe, score);
  const svg = (
    <svg viewBox="0 0 24 15" className="h-[26px] w-[40px]" fill="none" aria-hidden="true">
      {settore == null ? (
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="currentColor" strokeOpacity={0.45} strokeWidth="3" />
      ) : (
        <>
          {SETTORI_GAUGE_CERVED.map((c, i) => {
            const [x1, y1] = pt(180 - i * amp, r);
            const [x2, y2] = pt(180 - (i + 1) * amp, r);
            return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} stroke={c.pieno} strokeWidth="3" />;
          })}
          {(() => {
            const [x, y] = pt(180 - (settore + 0.5) * amp, r - 1.5);
            return <line x1={cx} y1={cy} x2={x} y2={y} className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />;
          })()}
          <circle cx={cx} cy={cy} r="1.8" className="fill-foreground" />
        </>
      )}
    </svg>
  );
  if (!onApri) {
    return (
      <span className={cn("inline-flex shrink-0 items-center text-muted-foreground", className)} title={etichetta} role="img" aria-label={etichetta}>
        {svg}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onApri(); }}
      className={cn("inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary", className)}
      title={etichetta}
      aria-label={`${etichetta}: apri la scheda Cerved del cliente`}
    >
      {svg}
    </button>
  );
}
