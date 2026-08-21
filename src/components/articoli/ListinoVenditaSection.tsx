import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchListiniVendita,
  upsertListinoVendita,
  prezzoFromRicarico,
  ricaricoFromPrezzo,
  margineFromPrezzo,
  FASCE,
  type FasciaListino,
} from "@/lib/articoli-api";
import { Input } from "@/components/ui/input";
import { NumberInputIt } from "@/components/ui/number-input-it";
import { Button } from "@/components/ui/button";
import { parseNumeroIt } from "@/lib/numero-it";
import { toast } from "sonner";

interface Row {
  fascia: FasciaListino;
  ricarico: string;
  prezzo: string;
  margine: string;
  dirty: boolean;
}

function emptyRows(): Row[] {
  return FASCE.map((f) => ({ fascia: f, ricarico: "", prezzo: "", margine: "", dirty: false }));
}

export function ListinoVenditaSection({
  articoloId,
  costoNetto,
}: {
  articoloId: string;
  costoNetto: number;
}) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["listini_vendita", articoloId],
    queryFn: () => fetchListiniVendita(articoloId),
  });

  const [rows, setRows] = useState<Row[]>(emptyRows());

  useEffect(() => {
    const base = emptyRows();
    for (const r of data) {
      const idx = base.findIndex((b) => b.fascia === r.fascia);
      if (idx >= 0) {
        base[idx] = {
          fascia: r.fascia,
          ricarico: r.ricarico !== null ? String(r.ricarico) : "",
          prezzo: r.prezzo !== null ? String(r.prezzo) : "",
          margine: r.margine !== null ? String(r.margine) : "",
          dirty: false,
        };
      }
    }
    setRows(base);
  }, [data]);

  function updateRicarico(idx: number, val: string) {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], ricarico: val, dirty: true };
      const ric = parseNumeroIt(val);
      if (val !== "" && ric !== null && costoNetto) {
        const p = prezzoFromRicarico(costoNetto, ric);
        r.prezzo = String(p);
        r.margine = String(margineFromPrezzo(costoNetto, p));
      }
      next[idx] = r;
      return next;
    });
  }

  function updatePrezzo(idx: number, val: string) {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], prezzo: val, dirty: true };
      const p = parseNumeroIt(val);
      if (val !== "" && p !== null && costoNetto) {
        r.ricarico = String(ricaricoFromPrezzo(costoNetto, p));
        r.margine = String(margineFromPrezzo(costoNetto, p));
      }
      next[idx] = r;
      return next;
    });
  }

  const saveMut = useMutation({
    mutationFn: async (row: Row) =>
      upsertListinoVendita({
        articolo_id: articoloId,
        fascia: row.fascia,
        ricarico: row.ricarico === "" ? null : parseNumeroIt(row.ricarico),
        prezzo: row.prezzo === "" ? null : parseNumeroIt(row.prezzo),
        margine: row.margine === "" ? null : parseNumeroIt(row.margine),
      }),
    onSuccess: () => {
      toast.success("Salvato");
      qc.invalidateQueries({ queryKey: ["listini_vendita", articoloId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Listino vendita (5 fasce)</h4>
        <div className="font-mono text-xs text-muted-foreground">
          Costo netto rif.: <span className="font-bold text-foreground">€ {costoNetto.toFixed(2)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Fascia</th>
              <th className="px-3 py-2 text-right">Ricarico %</th>
              <th className="px-3 py-2 text-right">Prezzo €</th>
              <th className="px-3 py-2 text-right">Margine %</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r, i) => (
              <tr key={r.fascia} className="border-t">
                <td className="px-3 py-1.5 font-bold">{r.fascia}</td>
                <td className="px-3 py-1.5 text-right">
                  <NumberInputIt
                    value={r.ricarico === "" ? null : r.ricarico}
                    onChange={(v) => updateRicarico(i, v == null ? "" : String(v))}
                    className="h-8 text-right font-mono text-xs"
                    disabled={!costoNetto}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <NumberInputIt
                    value={r.prezzo === "" ? null : r.prezzo}
                    onChange={(v) => updatePrezzo(i, v == null ? "" : String(v))}
                    className="h-8 text-right font-mono text-xs"
                    disabled={!costoNetto}
                  />
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.margine || "—"}</td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    size="sm"
                    variant={r.dirty ? "default" : "outline"}
                    disabled={!r.dirty || saveMut.isPending}
                    onClick={() => saveMut.mutate(r)}
                  >
                    Salva
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!costoNetto && (
        <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Inserisci prima una riga di listino acquisto per abilitare i calcoli automatici.
        </div>
      )}
    </div>
  );
}
