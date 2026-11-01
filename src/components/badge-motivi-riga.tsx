import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CLASSI_MOTIVO_RIGA, etichetteRigaProposta } from "@/lib/proposta-fido-riga";

/** Un badge per ogni motivo della riga (fonte unica: motiviRigaProposta), stessi colori del tema. */
export function BadgeMotiviRiga({ regola, segnalazioni, className = "" }: {
  regola: string;
  segnalazioni?: readonly string[] | null;
  className?: string;
}) {
  const etichette = etichetteRigaProposta({ regola, segnalazioni });
  if (etichette.length === 0) return null;
  return (
    <>
      {etichette.map((e) => (
        <Badge key={e.motivo} className={`shrink-0 whitespace-normal break-words px-1.5 text-[10px] ${CLASSI_MOTIVO_RIGA[e.motivo].badge} ${className}`}>
          {e.testo}
        </Badge>
      ))}
    </>
  );
}

/** "▸ dettagli" chiuso di default, con frase breve opzionale (massiva e Alert fidi). */
export function DettagliRiga({ frase, children }: { frase?: string | null; children?: ReactNode }) {
  if (!frase && !children) return null;
  return (
    <details className="group min-w-0">
      <summary className="grid min-h-8 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <span className="line-clamp-1 min-w-0 text-muted-foreground" title={frase ?? undefined}>{frase}</span>
        {children && <span className="whitespace-nowrap text-primary"><span aria-hidden className="inline-block transition-transform group-open:rotate-90">▸</span> dettagli</span>}
      </summary>
      {children && <div className="pt-1">{children}</div>}
    </details>
  );
}
