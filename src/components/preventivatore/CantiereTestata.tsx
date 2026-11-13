import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
import { CantierePicker } from "./CantierePicker";
import { NuovoCantiereForm } from "./NuovoCantiereForm";

type Modo = "cliente" | "nuovo" | "provvisorio";
const MODI: [Modo, string][] = [["cliente", "Cantiere del cliente"], ["nuovo", "+ Nuovo cantiere"], ["provvisorio", "Provvisorio"]];

export { BadgeProvvisorio } from "@/components/badge-provvisorio";
import { BadgeProvvisorio } from "@/components/badge-provvisorio";

/**
 * Riquadro Cantiere della Testata (FM65 B2): tre modi, tutti collegano un vero cantiere (onCantiere → cantiere_id).
 * cantiere_descrizione non viene più scritta: resta solo come fallback in lettura.
 */
export function CantiereTestata({ prev, editMode, onCantiere }: { prev: PreventivoConDettagli; editMode: boolean; onCantiere: (id: string) => void }) {
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

    {editMode && (!scelta && c
      ? <Button size="sm" variant="outline" className="bg-card" onClick={() => setScelta(true)}>Cambia</Button>
      : <div className="space-y-2">
        <div role="group" aria-label="Modo cantiere" className="flex flex-wrap gap-1">
          {MODI.map(([m, l]) => <Button key={m} type="button" size="sm" variant={modo === m ? "default" : "outline"} className={cn(modo !== m && "bg-card")} onClick={() => scegli(m)}>{l}</Button>)}
        </div>
        {modo === "cliente" && <CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={collega} />}
        {c && <Button size="sm" variant="ghost" onClick={() => { setScelta(false); setModo("cliente"); }}>Annulla</Button>}
      </div>)}

    <Dialog open={finestra} onOpenChange={(o) => { setFinestra(o); if (!o) setModo("cliente"); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modo === "provvisorio" ? "Cantiere provvisorio" : "Nuovo cantiere"}</DialogTitle>
          <DialogDescription>{modo === "provvisorio" ? "Viene salvato fra i cantieri del cliente con il segno provvisorio." : "Viene salvato fra i cantieri del cliente e collegato al preventivo."}</DialogDescription>
        </DialogHeader>
        <NuovoCantiereForm key={modo} clienteId={prev.cliente_id} provvisorio={modo === "provvisorio"} onCreato={(n) => collega(n.id)} />
      </DialogContent>
    </Dialog>
  </div>;
}
