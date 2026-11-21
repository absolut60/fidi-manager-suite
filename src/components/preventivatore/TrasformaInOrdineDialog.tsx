import { useEffect, useMemo, useState } from "react";
import { importoRiga } from "@/lib/riga-preventivo";
import { isRigaOrdinabile, statoEvasioneRiga } from "@/lib/evasione";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Loader2 } from "lucide-react";
import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import {
  trasformaPreventivoInOrdine,
  type PreventivoConDettagli,
  type SelezioneTrasformazione,
} from "@/lib/preventivi-api";
import { cn } from "@/lib/utils";
import { lineaPreventivo } from "@/lib/linee-preventivo";
import { datiMancantiRigaGamma } from "@/lib/articolo-in-definizione";

type Stato = {
  // per riga: quantità da ordinare ora + selezione
  righe: Record<string, { selected: boolean; qta: number }>;
};

const fmt = (v: number) =>
  v.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export function TrasformaInOrdineDialog({
  open,
  onOpenChange,
  prev,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prev: PreventivoConDettagli;
}) {
  const navigate = useNavigate();
  const [stato, setStato] = useState<Stato>({ righe: {} });

  // Reset stato all'apertura: pre-seleziona tutte le righe con residuo>0 al residuo intero.
  useEffect(() => {
    if (!open) return;
    const next: Stato["righe"] = {};
    for (const b of prev.blocchi) {
      for (const r of b.righe) {
        const { residuo } = statoEvasioneRiga(r);
        if (residuo <= 0) continue;
        next[r.id] = { selected: true, qta: residuo };
      }
    }
    setStato({ righe: next });
  }, [open, prev]);

  const totaleSelezionato = useMemo(() => {
    let tot = 0;
    for (const b of prev.blocchi) {
      for (const r of b.righe) {
        const s = stato.righe[r.id];
        if (!s?.selected || !s.qta) continue;
        tot += importoRiga({ ...r, quantita: s.qta });
      }
    }
    return tot;
  }, [stato, prev]);

  const numRigheSel = useMemo(
    () => Object.values(stato.righe).filter((s) => s.selected && s.qta > 0).length,
    [stato],
  );

  const trasforma = useMutation({
    mutationFn: async () => {
      const selezione: SelezioneTrasformazione[] = [];
      for (const b of prev.blocchi) {
        const righe: { riga_id: string; quantita: number }[] = [];
        for (const r of b.righe) {
          const s = stato.righe[r.id];
          if (!s?.selected || !s.qta || s.qta <= 0) continue;
          righe.push({ riga_id: r.id, quantita: s.qta });
        }
        if (righe.length) selezione.push({ blocco_id: b.id, righe });
      }
      if (!selezione.length) throw new Error("Seleziona almeno una riga con quantità > 0");
      if (righeIncomplete.length) throw new Error("Completa i dati delle righe non pronte per Gamma");
      return trasformaPreventivoInOrdine(prev.id, selezione);
    },
    onSuccess: (newId) => {
      toast.success("Ordine creato");
      onOpenChange(false);
      navigate({ to: "/preventivatore/$id", params: { id: newId } });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  // FM75 F4c: prontezza per Gamma delle righe manuali selezionate (solo linee con articoloInDefinizione).
  const conDefinizione = lineaPreventivo(prev.linea).blocchi.articoloInDefinizione;
  const righeIncomplete = useMemo(() => {
    if (!conDefinizione) return [];
    const out: { id: string; descrizione: string; mancano: string[] }[] = [];
    for (const b of prev.blocchi) for (const r of b.righe) {
      const s = stato.righe[r.id];
      if (!s?.selected || s.qta <= 0) continue;
      const mancano = datiMancantiRigaGamma(r);
      if (mancano.length) out.push({ id: r.id, descrizione: r.descrizione || "senza descrizione", mancano });
    }
    return out;
  }, [conDefinizione, prev.blocchi, stato.righe]);

  function setRiga(id: string, patch: Partial<{ selected: boolean; qta: number }>) {
    setStato((s) => ({
      ...s,
      righe: { ...s.righe, [id]: { ...(s.righe[id] ?? { selected: false, qta: 0 }), ...patch } },
    }));
  }

  function toggleBlocco(bloccoIdx: number, val: boolean) {
    const next = { ...stato.righe };
    const b = prev.blocchi[bloccoIdx];
    for (const r of b.righe) {
      const cur = next[r.id];
      if (!cur) continue; // non selezionabile (evasa o non valorizzata)
      next[r.id] = { ...cur, selected: val };
    }
    setStato({ righe: next });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Trasforma in ordine
          </DialogTitle>
          <DialogDescription>
            Seleziona righe e quantità da trasformare. Le righe già evase sono disabilitate.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto p-4">
          {prev.blocchi.map((b, bi) => {
            const righeValorizzate = b.righe.filter((r) => isRigaOrdinabile(r.tipo_riga));
            const righeOrdinabili = righeValorizzate.filter((r) => {
              const { residuo } = statoEvasioneRiga(r);
              return residuo > 0;
            });
            const tutteSel =
              righeOrdinabili.length > 0 &&
              righeOrdinabili.every((r) => stato.righe[r.id]?.selected);
            return (
              <div key={b.id} className="mb-4 rounded-md border">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <Checkbox
                    checked={tutteSel}
                    disabled={righeOrdinabili.length === 0}
                    onCheckedChange={(v) => toggleBlocco(bi, !!v)}
                  />
                  <div className="text-sm font-semibold">
                    {b.rif_capitolato ? `[${b.rif_capitolato}] ` : ""}
                    {b.descrizione || "Blocco"}
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {righeOrdinabili.length}/{righeValorizzate.length} ordinabili
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2"></th>
                      <th className="p-2 text-left">Descrizione</th>
                      <th className="w-16 p-2 text-left">U.M.</th>
                      <th className="w-20 p-2 text-right">Totale</th>
                      <th className="w-20 p-2 text-right">Ordinato</th>
                      <th className="w-20 p-2 text-right">Residuo</th>
                      <th className="w-28 p-2 text-right">Da ordinare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righeValorizzate.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-3 text-center text-muted-foreground">
                          Nessuna riga valorizzata.
                        </td>
                      </tr>
                    )}
                    {righeValorizzate.map((r) => {
                      const { ordinata: qOrd, quantita: qTot, residuo } = statoEvasioneRiga(r);
                      const evasa = residuo <= 0;
                      const s = stato.righe[r.id];
                      return (
                        <tr
                          key={r.id}
                          className={cn("border-t", evasa && "bg-muted/30 text-muted-foreground")}
                        >
                          <td className="p-2 text-center">
                            <Checkbox
                              disabled={evasa}
                              checked={!!s?.selected}
                              onCheckedChange={(v) => setRiga(r.id, { selected: !!v })}
                            />
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{r.descrizione || "—"}</div>
                            {evasa && (
                              <Badge variant="outline" className="mt-0.5 h-4 text-[9px]">
                                Evasa
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 font-mono">{r.um ?? ""}</td>
                          <td className="p-2 text-right font-mono">{fmt(qTot)}</td>
                          <td className="p-2 text-right font-mono">{fmt(qOrd)}</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {fmt(residuo)}
                          </td>
                          <td className="p-2 text-right">
                            {evasa ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <EditableNumberCell
                                value={s?.qta ?? residuo}
                                step={0.01}
                                onCommit={(v) => {
                                  const q = Math.max(0, Math.min(residuo, Number(v ?? 0)));
                                  setRiga(r.id, { qta: q, selected: q > 0 });
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {righeIncomplete.length > 0 && (
          <div role="alert" className="mx-3 mb-2 rounded-md border border-l-4 border-destructive/40 border-l-destructive bg-destructive/5 p-3 text-sm">
            <p className="font-semibold text-destructive">Righe non pronte per Gamma: completa i dati prima di creare l'ordine</p>
            <ul className="mt-1 grid gap-0.5">
              {righeIncomplete.map((r) => (
                <li key={r.id} className="break-words">Riga: {r.descrizione} — mancano: {r.mancano.join(", ")}</li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter className="border-t bg-muted/20 p-3">
          <div className="mr-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{numRigheSel} righe</span>
            <span className="font-mono font-semibold">
              € {totaleSelezionato.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={trasforma.isPending}>
            Annulla
          </Button>
          <Button onClick={() => trasforma.mutate()} disabled={trasforma.isPending || numRigheSel === 0 || righeIncomplete.length > 0}>
            {trasforma.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creazione…
              </>
            ) : (
              <>
                <ShoppingCart className="mr-1 h-4 w-4" /> Crea ordine
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
