import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CantiereDialog } from "@/components/cantiere-dialog";
import { cn } from "@/lib/utils";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
import { CantierePicker } from "./CantierePicker";

type Modo = "cliente" | "nuovo" | "provvisorio";
const MODI: [Modo, string][] = [["cliente", "Cantiere del cliente"], ["nuovo", "+ Nuovo cantiere"], ["provvisorio", "Provvisorio"]];

export { BadgeProvvisorio } from "@/components/badge-provvisorio";
import { BadgeProvvisorio } from "@/components/badge-provvisorio";

/**
 * Riquadro Cantiere della Testata (FM65 B2): tre modi, tutti collegano un vero cantiere (onCantiere → cantiere_id).
 * cantiere_descrizione non viene più scritta: resta solo come fallback in lettura.
 */
export function CantiereTestata({ prev, modificabile, onCantiere, clienteEtichetta }: { prev: PreventivoConDettagli; modificabile: boolean; onCantiere: (id: string) => void; clienteEtichetta?: string }) {
  const qc = useQueryClient();
  const soggettoFisso = useMemo(() => prev.cliente_id ? { tipo: "cliente" as const, id: prev.cliente_id, etichetta: clienteEtichetta || prev.cliente?.ragione_sociale || "Cliente" } : undefined, [prev.cliente_id, prev.cliente?.ragione_sociale, clienteEtichetta]);
  const c = prev.cantiere;
  const storico = (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const [scelta, setScelta] = useState(!c);
  const [modo, setModo] = useState<Modo>("cliente");
  const [finestra, setFinestra] = useState(false);
  const loc = c ? [[c.cap, c.citta].filter(Boolean).join(" "), c.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ") : "";

  const scegli = (m: Modo) => { setModo(m); if (m !== "cliente") setFinestra(true); };
  const collega = (id: string) => { onCantiere(id); setScelta(false); setFinestra(false); setModo("cliente"); };

  return <div className="space-y-3">
    {c ? <div className="min-w-0 space-y-0.5 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words font-semibold">{c.nome || "—"}</span>{c.provvisorio && <BadgeProvvisorio />}</div>
      {c.indirizzo && <p className="break-words">{c.indirizzo}</p>}
      {loc && <p className="break-words text-muted-foreground">{loc}</p>}
    </div> : <p className="break-words text-sm">{storico || "Da definire"}</p>}

    {modificabile && (!scelta && c
      ? <Button size="sm" variant="outline" className="bg-card" onClick={() => setScelta(true)}>Cambia</Button>
      : <div className="space-y-2">
        <div role="group" aria-label="Modo cantiere" className="flex flex-wrap gap-1">
          {MODI.map(([m, l]) => <Button key={m} type="button" size="sm" variant={modo === m ? "default" : "outline"} className={cn(modo !== m && "bg-card")} disabled={m !== "cliente" && !prev.cliente_id} title={m !== "cliente" && !prev.cliente_id ? "Prima seleziona un cliente" : undefined} onClick={() => scegli(m)}>{l}</Button>)}
        </div>
        {modo === "cliente" && <CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={collega} />}
        {c && <Button size="sm" variant="ghost" onClick={() => { setScelta(false); setModo("cliente"); }}>Annulla</Button>}
      </div>)}

    {finestra && soggettoFisso && <CantiereDialog
      open={finestra}
      onOpenChange={(o) => { setFinestra(o); if (!o) setModo("cliente"); }}
      soggettoFisso={soggettoFisso}
      provvisorioIniziale={modo === "provvisorio"}
      onSalvato={(n) => { collega(n.id); qc.invalidateQueries({ queryKey: ["cantieri-lite", prev.cliente_id] }); }}
    />}
  </div>;
}
