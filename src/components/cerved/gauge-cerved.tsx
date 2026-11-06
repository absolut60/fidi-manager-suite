import { settoreGaugeCerved, SETTORI_GAUGE_CERVED } from "@/lib/cerved-presentazione";

/**
 * Unico gauge Cerved Group Score dell'app (come nel Light Report):
 * 270° da 225° (basso sinistra) a −45° (basso destra), 8 settori.
 * La dimensione si decide con className (larghezza); il disegno è sempre lo stesso.
 */
export function GaugeCerved({ valore, className = "w-full max-w-64" }: { valore: number | null; className?: string }) {
  const attivo = settoreGaugeCerved(valore);
  const pt = (deg: number, r: number) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 - r * Math.sin((deg * Math.PI) / 180)];
  const ampiezza = 270 / 8;
  const spazio = 3;
  return (
    <svg viewBox="0 0 200 180" className={className} role="img" aria-label={`Affidabilità ${valore ?? "non disponibile"} su 100`}>
      {SETTORI_GAUGE_CERVED.map((c, i) => {
        const on = i === attivo;
        const r = on ? 80 : 76;
        const da = 225 - i * ampiezza - spazio / 2;
        const a = 225 - (i + 1) * ampiezza + spazio / 2;
        const [x1, y1] = pt(da, r);
        const [x2, y2] = pt(a, r);
        return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={on ? c.pieno : c.pastello} strokeWidth={on ? 22 : 14} strokeLinecap="butt" />;
      })}
    </svg>
  );
}

/** Colore pieno del settore attivo (per numero ed etichetta accanto al gauge). */
export function tintaGaugeCerved(valore: number | null): string | undefined {
  const s = settoreGaugeCerved(valore);
  return s == null ? undefined : SETTORI_GAUGE_CERVED[s].pieno;
}
