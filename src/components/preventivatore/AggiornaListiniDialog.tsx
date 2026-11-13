import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AnalisiAggiornaListini, DifferenzaListino } from "@/lib/preventivi-api";
import { formatScontiGamma } from "@/lib/riga-preventivo";
import { cn } from "@/lib/utils";
import { formatNumeroIt } from "@/lib/numero-it";

const f4 = (v: number | null) => v == null ? "—" : formatNumeroIt(v, { minDecimals: 4, maxDecimals: 4 });

/** FM65: tutte spuntate; si toglie la spunta dove non si è d'accordo. Rosso = netto nuovo sotto il costo. */
export function AggiornaListiniDialog({ analisi, onClose, onApplica, inCorso }: {
  analisi: AnalisiAggiornaListini | null;
  onClose: () => void;
  onApplica: (scelte: DifferenzaListino[]) => void;
  inCorso: boolean;
}) {
  const [spunte, setSpunte] = useState<Set<string>>(new Set());
  useEffect(() => { setSpunte(new Set(analisi?.differenze.map((d) => d.riga_id) ?? [])); }, [analisi]);
  if (!analisi) return null;
  const riga = (label: string, a: string, b: string) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", a !== b && "font-semibold")}>{a} → {b}</span>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col">
        <DialogHeader><DialogTitle>Aggiorna listini: {analisi.differenze.length} righe con differenze</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Invariate {analisi.invariate} · senza prezzo dal motore {analisi.senza_prezzo} · senza codice Gamma {analisi.senza_codice} · manuali, note e altre righe {analisi.non_articolo}. Lo sconto extra non cambia.
        </p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {analisi.differenze.map((d) => {
            const c = d.confronto;
            return (
              <label key={d.riga_id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded border p-2", c.sottoCosto && "border-destructive bg-destructive/5")}>
                <Checkbox className="mt-1 h-5 w-5" checked={spunte.has(d.riga_id)} onCheckedChange={(v) => {
                  const s = new Set(spunte); if (v) s.add(d.riga_id); else s.delete(d.riga_id); setSpunte(s);
                }} aria-label={`Aggiorna ${d.codice}`} />
                <div className="min-w-0 space-y-0.5">
                  <div className="break-words text-sm"><span className="font-mono font-semibold">{d.codice}</span> {d.descrizione}</div>
                  {riga("Prezzo lordo", f4(c.attuali.prezzo_unit), f4(c.nuovi.prezzo_unit))}
                  {riga("Sconti", formatScontiGamma(c.attuali.sconti_gamma) || "—", formatScontiGamma(c.nuovi.sconti_gamma) || "—")}
                  {riga("Magg.%", formatNumeroIt(c.attuali.maggiorazione_perc), formatNumeroIt(c.nuovi.maggiorazione_perc))}
                  {riga("Costo unit.", f4(c.attuali.costo_unit), f4(c.nuovi.costo_unit))}
                  {c.sottoCosto && <div className="text-xs font-semibold text-destructive">Netto nuovo {f4(c.nettoNuovo)} sotto il costo</div>}
                </div>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={inCorso || spunte.size === 0}
            onClick={() => onApplica(analisi.differenze.filter((d) => spunte.has(d.riga_id)))}>
            Applica ({spunte.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
