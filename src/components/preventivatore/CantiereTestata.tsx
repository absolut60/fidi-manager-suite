import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { distanzaCantiereSede } from "@/lib/cantieri.functions";
import { Button } from "@/components/ui/button";
import { CantiereDialog } from "@/components/cantiere-dialog";
import { cn } from "@/lib/utils";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
import { CantierePicker } from "./CantierePicker";
import { supabase } from "@/integrations/supabase/client";
import type { CantiereRow, SedeMappa } from "@/lib/cantieri";
import { formatoDistanzaCantiere } from "@/lib/cantiere-distanza";
import { MappaCantierePreventivo } from "./MappaCantierePreventivo";

type Modo = "cliente" | "nuovo" | "provvisorio";
const MODI: [Modo, string][] = [["cliente", "Cantiere del cliente"], ["nuovo", "+ Nuovo cantiere"], ["provvisorio", "Provvisorio"]];

export { BadgeProvvisorio } from "@/components/badge-provvisorio";
import { BadgeProvvisorio } from "@/components/badge-provvisorio";

/**
 * Riquadro Cantiere della Testata (FM65 B2): tre modi, tutti collegano un vero cantiere (onCantiere → cantiere_id).
 * cantiere_descrizione non viene più scritta: resta solo come fallback in lettura.
 */
export function CantiereTestata({ prev, modificabile, onCantiere, clienteEtichetta, sedeClienteNome, sedeClienteId }: { prev: PreventivoConDettagli; modificabile: boolean; onCantiere: (id: string) => void; clienteEtichetta?: string; sedeClienteNome?: string; sedeClienteId?: string | null }) {
  const qc = useQueryClient();
  const soggettoFisso = useMemo(() => prev.cliente_id ? { tipo: "cliente" as const, id: prev.cliente_id, etichetta: clienteEtichetta || prev.cliente?.ragione_sociale || "Cliente" } : undefined, [prev.cliente_id, prev.cliente?.ragione_sociale, clienteEtichetta]);
  const c = prev.cantiere;
  const storico = (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const [scelta, setScelta] = useState(!c);
  const [modo, setModo] = useState<Modo>("cliente");
  const [finestra, setFinestra] = useState(false);
  const [mappa, setMappa] = useState(false);
  const { data: geo, error: erroreGeo } = useQuery({
    queryKey: ["cantiere-preventivo-posizione", c?.id], enabled: !!c?.id,
    queryFn: async () => {
      if (!c?.id) return null;
      const { data, error } = await supabase.from("cantieri").select("*").eq("id", c.id).maybeSingle();
      if (error) throw error;
      return data as CantiereRow | null;
    },
  });
  const { data: sedi = [] } = useQuery({
    queryKey: ["sedi-cantiere-preventivo", geo?.sede_piu_vicina_id, sedeClienteId],
    enabled: !!geo,
    queryFn: async () => {
      const select = "id, nome, indirizzo, cap, citta, provincia, telefono, lat, lng";
      const [vicina, cliente] = await Promise.all([
        geo?.sede_piu_vicina_id ? supabase.from("stores").select(select).eq("id", geo.sede_piu_vicina_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        sedeClienteId ? supabase.from("stores").select(select).eq("id", sedeClienteId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (vicina.error || cliente.error) throw vicina.error || cliente.error;
      return [vicina.data, cliente.data].filter((s): s is SedeMappa => s != null);
    },
  });
  const vicina = sedi.find(s => s.id === geo?.sede_piu_vicina_id);
  const sedeCliente = sedi.find(s => s.id === sedeClienteId);
  const stessaSede = !!sedeCliente && sedeCliente.id === geo?.sede_piu_vicina_id;
  const fetchDistanza = useServerFn(distanzaCantiereSede);
  const { data: distanzaCliente, isFetching: caricaDistanza, error: erroreDistanza } = useQuery({
    queryKey: ["distanza-cantiere-sede", c?.id, sedeCliente?.id, geo?.lat, geo?.lng],
    enabled: !!c?.id && !!sedeCliente && !stessaSede && geo?.lat != null && geo?.lng != null,
    staleTime: Infinity,
    retry: false,
    queryFn: () => {
      if (!c?.id || !sedeCliente) return null;
      return fetchDistanza({ data: { cantiere_id: c.id, store_id: sedeCliente.id } });
    },
  });
  const sediMappa = useMemo(() => Array.from(new Map(sedi.map(s => [s.id, { ...s, nome: `${s.nome}${s.id === sedeCliente?.id ? " (sede del cliente)" : ""}${s.id === geo?.sede_piu_vicina_id ? " (sede più vicina)" : ""}` }])).values()), [sedi, sedeCliente?.id, geo?.sede_piu_vicina_id]);
  const loc = c ? [[c.cap, c.citta].filter(Boolean).join(" "), c.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ") : "";

  const scegli = (m: Modo) => { setModo(m); if (m !== "cliente") setFinestra(true); };
  const collega = (id: string) => { onCantiere(id); setScelta(false); setFinestra(false); setModo("cliente"); };

  return <div className="space-y-3">
    {c ? <div className="min-w-0 space-y-0.5 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Button variant="link" className="h-auto min-h-10 min-w-0 whitespace-normal break-words p-0 text-left font-semibold" onClick={() => setMappa(true)}>{c.nome || "—"}</Button>{c.provvisorio && <BadgeProvvisorio />}</div>
      {c.indirizzo && <p className="break-words">{c.indirizzo}</p>}
      {loc && <p className="break-words text-muted-foreground">{loc}</p>}
      {geo && <p className="break-words text-xs text-muted-foreground">{geo.lat == null || geo.lng == null
        ? "Posizione non disponibile: apri il cantiere e scegli l'indirizzo dai suggerimenti"
        : vicina && geo.sede_piu_vicina_km != null && geo.sede_piu_vicina_min != null
          ? `Sede più vicina: ${vicina.nome}${stessaSede ? " (sede del cliente)" : ""} · ${formatoDistanzaCantiere(geo.sede_piu_vicina_km, geo.sede_piu_vicina_min)}`
          : "Distanza non ancora calcolata"}</p>}
      {geo?.lat != null && geo.lng != null && sedeCliente && !stessaSede && <p className="break-words text-xs text-muted-foreground">
        Dalla sede del cliente ({sedeClienteNome || sedeCliente.nome}): {caricaDistanza ? "Calcolo distanza…" : erroreDistanza ? "Distanza non disponibile." : distanzaCliente ? formatoDistanzaCantiere(distanzaCliente.km, Math.round(distanzaCliente.minuti)) : "Percorso non disponibile."}
      </p>}
      {erroreGeo && <p className="text-xs text-muted-foreground">Posizione non disponibile.</p>}
    </div> : <p className="break-words text-sm">{storico || "Da definire"}</p>}

    {modificabile && (!scelta && c
      ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="bg-card" onClick={() => setScelta(true)}>Cambia</Button><Button size="sm" variant="outline" onClick={() => setMappa(true)}>Vedi sulla mappa</Button></div>
      : <div className="space-y-2">
        <div role="group" aria-label="Modo cantiere" className="flex flex-wrap gap-1">
          {MODI.map(([m, l]) => <Button key={m} type="button" size="sm" variant={modo === m ? "default" : "outline"} className={cn(modo !== m && "bg-card")} disabled={m !== "cliente" && !prev.cliente_id} title={m !== "cliente" && !prev.cliente_id ? "Prima seleziona un cliente" : undefined} onClick={() => scegli(m)}>{l}</Button>)}
        </div>
        {modo === "cliente" && <CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={collega} />}
        {c && <Button size="sm" variant="ghost" onClick={() => { setScelta(false); setModo("cliente"); }}>Annulla</Button>}
      </div>)}
    {!modificabile && c && <Button size="sm" variant="outline" onClick={() => setMappa(true)}>Vedi sulla mappa</Button>}
    {mappa && geo && <MappaCantierePreventivo open={mappa} onOpenChange={setMappa} cantiere={geo} sedi={sediMappa} sedeCliente={sedeCliente}/>}

    {finestra && soggettoFisso && <CantiereDialog
      open={finestra}
      onOpenChange={(o) => { setFinestra(o); if (!o) setModo("cliente"); }}
      soggettoFisso={soggettoFisso}
      provvisorioIniziale={modo === "provvisorio"}
      onSalvato={(n) => { collega(n.id); qc.invalidateQueries({ queryKey: ["cantieri-lite", prev.cliente_id] }); }}
    />}
  </div>;
}
