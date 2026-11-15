import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { vistaCommerciale } from "@/lib/vista-commerciale";
import type { BloccoConRighe } from "@/lib/preventivi-api";
import { formatNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const euro = (v: number) => `€ ${formatNumeroIt(v, { minDecimals: 2, maxDecimals: 2 })}`;
const perOrdine = <T extends { ordine?: number | null }>(a: T[]) => [...a].sort((x, y) => Number(x.ordine ?? 0) - Number(y.ordine ?? 0));

/** FM75 F2c: anteprima della vista commerciale; usa solo vistaCommerciale (docs/regole/vista-commerciale.md). */
export function VistaCommercialeDialog({ open, onOpenChange, blocchi, riepilogoIva }: { open: boolean; onOpenChange: (v: boolean) => void; blocchi: BloccoConRighe[]; riepilogoIva?: ReactNode }) {
  const vista = useMemo(() => vistaCommerciale(perOrdine(blocchi).map(b => ({ ...b, righe: perOrdine(b.righe) }))), [blocchi]);
  const gruppo = vista.raccoglitori[0];
  const ciSonoNascoste = blocchi.some(b => b.righe.some(r => r.stampabile === false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] min-w-0 max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista commerciale</DialogTitle>
          <DialogDescription>Come il cliente vedrà il documento: le righe nascoste confluiscono nella riga di fornitura e posa.</DialogDescription>
        </DialogHeader>
        {!gruppo && ciSonoNascoste && (
          <p role="status" className="rounded-md border-l-4 border-l-pv-giallo bg-pv-giallo-tenue px-3 py-2 text-sm">
            Senza riga PEF si stampa tutto: le righe nascoste compariranno comunque.
          </p>
        )}
        <div className="space-y-3">
          {vista.blocchi.filter(b => !b.vuoto).map((b, i) => (
            <div key={b.blocco.id ?? i} className="rounded-md border">
              <div className="flex items-start justify-between gap-3 border-b bg-pv-azzurro px-3 py-2">
                <span className="min-w-0 break-words text-sm font-semibold">{b.blocco.descrizione || `Blocco ${i + 1}`}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold">{euro(b.subtotaleStampato)}</span>
              </div>
              <ul className="divide-y">
                {b.righe.map((r, j) => (
                  <li key={r.riga.id ?? j} className={cn("flex items-start justify-between gap-3 px-3 py-1.5 text-sm", r.raccoglitore && "bg-pv-viola-tenue")}>
                    <div className="min-w-0">
                      <p className="break-words">{r.riga.descrizione || "—"}</p>
                      {r.raccoglitore && gruppo && (
                        <p className="text-xs text-muted-foreground">
                          di cui posa {euro(gruppo.importoProprio)} · righe nascoste {euro(gruppo.importoNascoste)} ({gruppo.nascoste.length})
                        </p>
                      )}
                    </div>
                    {r.riga.importo != null && <span className="shrink-0 whitespace-nowrap font-mono">{euro(r.importoStampato)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {vista.blocchi.every(b => b.vuoto) && <p className="text-sm text-muted-foreground">Nessuna riga da mostrare.</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm font-semibold">
          <span>Totale documento</span>
          <span className="font-mono">{euro(vista.totaleStampato)}</span>
        </div>
        {riepilogoIva && <div className="border-t pt-3">{riepilogoIva}</div>}
      </DialogContent>
    </Dialog>
  );
}
