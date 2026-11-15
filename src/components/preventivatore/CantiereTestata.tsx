import type { ReactNode } from "react";
import { ChevronRight, HardHat, MapPin, Navigation, Plus, Store } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { AzioneRiquadro } from "./AzioneRiquadro";
import { RiquadroScheda } from "./RiquadroScheda";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { distanzaCantiereSede } from "@/lib/cantieri.functions";
import { Button } from "@/components/ui/button";
import { CantiereDialog } from "@/components/cantiere-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
import { CantierePicker } from "./CantierePicker";
import { supabase } from "@/integrations/supabase/client";
import type { CantiereRow, SedeMappa } from "@/lib/cantieri";
import { formatoDistanzaCantiere, nomeSedeBreve } from "@/lib/cantiere-distanza";
import { toast } from "sonner";
import { PrezziCantiereDialog } from "@/components/prezzi-cantiere-dialog";
import { BadgePrezziDedicati } from "@/components/badge-prezzi-dedicati";
import { chiaveConteggioPrezziCantiere, contaPrezziCantiere, mostraAvvisoPrezziCantiere, testoPrezziDedicati, useCantieriModificabili } from "@/lib/cantiere-listini-api";
import { MappaCantierePreventivo } from "./MappaCantierePreventivo";

export { BadgeProvvisorio } from "@/components/badge-provvisorio";
import { BadgeProvvisorio } from "@/components/badge-provvisorio";

/**
 * Riquadro Cantiere della Testata (FM65 B2): ingresso unico, scelta e creazione collegano un vero cantiere (onCantiere → cantiere_id).
 * cantiere_descrizione non viene più scritta: resta solo come fallback in lettura.
 */
export function CantiereTestata({ prev, modificabile, onCantiere, clienteEtichetta, sedeClienteNome, sedeClienteId }: { prev: PreventivoConDettagli; modificabile: boolean; onCantiere: (id: string) => void | Promise<void>; clienteEtichetta?: string; sedeClienteNome?: string; sedeClienteId?: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scheda, setScheda] = useState(false);
  const soggettoFisso = useMemo(() => prev.cliente_id ? { tipo: "cliente" as const, id: prev.cliente_id, etichetta: clienteEtichetta || prev.cliente?.ragione_sociale || "Cliente" } : undefined, [prev.cliente_id, prev.cliente?.ragione_sociale, clienteEtichetta]);
  const c = prev.cantiere;
  const storico = (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const [scelta, setScelta] = useState(false);
  const [finestra, setFinestra] = useState(false);
  const [mappa, setMappa] = useState(false);
  const [prezziId, setPrezziId] = useState<string | null>(null);
  const { data: numeroPrezzi } = useQuery({
    queryKey: chiaveConteggioPrezziCantiere(c?.id ?? ""),
    queryFn: () => c ? contaPrezziCantiere(c.id) : 0,
    enabled: !!c?.id,
  });
  const { data: cantierePrezzi } = useQuery({
    queryKey: ["cantiere-preventivo-posizione", prezziId],
    enabled: !!prezziId,
    queryFn: async () => {
      if (!prezziId) return null;
      const { data, error } = await supabase.from("cantieri").select("*").eq("id", prezziId).maybeSingle();
      if (error) throw error;
      return data as CantiereRow | null;
    },
  });
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
  const sediMappa = useMemo(() => Array.from(new Map(sedi.map(s => [s.id, { ...s, nome: `${nomeSedeBreve(s.nome)}${s.id === sedeCliente?.id ? " (sede del cliente)" : ""}${s.id === geo?.sede_piu_vicina_id ? " (sede più vicina)" : ""}` }])).values()), [sedi, sedeCliente?.id, geo?.sede_piu_vicina_id]);
  const loc = c ? [[c.cap, c.citta].filter(Boolean).join(" "), c.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ") : "";

  const collega = async (id: string) => {
    try { await onCantiere(id); } catch { return; } // The existing save handler reports failures.
    setScelta(false); setFinestra(false);
    try {
      const n = await qc.fetchQuery({ queryKey: chiaveConteggioPrezziCantiere(id), queryFn: () => contaPrezziCantiere(id), staleTime: 0 });
      if (mostraAvvisoPrezziCantiere(n, "scelta")) toast.info(`Questo cantiere ha ${testoPrezziDedicati(n)}`, { action: { label: "Vedi", onClick: () => setPrezziId(id) } });
    } catch { /* An unavailable count must not block linking the site. */ }
  };

  const { data: modificabili } = useCantieriModificabili(geo ? [geo.id] : [], geo);
  const apriCantiere = () => {
    if (geo && modificabili?.has(geo.id)) setScheda(true);
    else if (c) void navigate({ to: "/cantieri", search: { tab: "lista", focus: c.id } });
  };
  const rigaDistanza = (etichetta: string, valore: ReactNode, riferimento = false) => <div className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-2 py-1">
    <span className="flex min-w-0 items-start gap-1.5 text-[11px] text-muted-foreground"><span className="shrink-0 pt-0.5">{riferimento ? <Navigation className="size-3"/> : <Store className="size-3"/>}</span><span className="break-words uppercase">{etichetta}</span></span>
    <span className="min-w-0 break-words text-xs">{valore}</span>
  </div>;
  return <RiquadroScheda titolo="Cantiere" icona={HardHat} tono="verde" densita="compatta" azioni={<>
    {c && <AzioneRiquadro icona={MapPin} etichetta="Vedi sulla mappa" onClick={() => setMappa(true)}/>}
  </>}><div className="space-y-2">
    {c ? <div className="min-w-0 space-y-1 text-xs">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><Button variant="link" className="h-auto min-h-10 min-w-0 justify-start whitespace-normal break-words p-0 text-left text-xs font-semibold text-foreground hover:text-primary hover:no-underline" onClick={apriCantiere}><span className="min-w-0 break-words">{c.nome || "—"}</span><ChevronRight className="size-3.5 shrink-0" aria-hidden/></Button>{c.provvisorio && <BadgeProvvisorio />}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><BadgePrezziDedicati conteggio={numeroPrezzi} mostraNumero onClick={() => setPrezziId(c.id)} /></div>
      {(c.indirizzo || loc) && <p className="flex items-start gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 size-3 shrink-0" aria-hidden/><span className="min-w-0 break-words">{[c.indirizzo, loc].filter(Boolean).join(", ")}</span></p>}
      <div className="pt-1">
      {geo && rigaDistanza(stessaSede ? "Più vicina · di riferimento" : "Più vicina", geo.lat == null || geo.lng == null
        ? "Posizione non disponibile: apri il cantiere e scegli l'indirizzo dai suggerimenti"
        : vicina && geo.sede_piu_vicina_km != null && geo.sede_piu_vicina_min != null
          ? `${nomeSedeBreve(vicina.nome)} · ${formatoDistanzaCantiere(geo.sede_piu_vicina_km, geo.sede_piu_vicina_min)}`
          : "Distanza non ancora calcolata")}
      {geo?.lat != null && geo.lng != null && sedeCliente && !stessaSede && rigaDistanza("Di riferimento", caricaDistanza ? "Calcolo distanza…" : erroreDistanza ? "Distanza non disponibile." : distanzaCliente ? `${nomeSedeBreve(sedeClienteNome || sedeCliente.nome)} · ${formatoDistanzaCantiere(distanzaCliente.km, Math.round(distanzaCliente.minuti))}` : "Percorso non disponibile.", true)}
      {erroreGeo && rigaDistanza("Più vicina", "Posizione non disponibile.")}
      </div>
    </div> : <div className="space-y-2"><p className="break-words text-xs">{storico || "Da definire"}</p></div>}

    {modificabile && <Button variant="outline" size="sm" className="min-h-10" onClick={() => setScelta(true)}><Plus className="size-3.5"/>{c ? "Cambia cantiere" : "Inserisci cantiere"}</Button>}
    <Dialog open={scelta} onOpenChange={setScelta}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{c ? "Cambia cantiere" : "Inserisci cantiere"}</DialogTitle><DialogDescription>{prev.lead_id ? "I cantieri del lead non sono ancora collegabili al preventivo." : "Scegli un cantiere del cliente oppure creane uno nuovo."}</DialogDescription></DialogHeader>
        {prev.cliente_id && <div className="grid gap-4">
          <div className="grid gap-2"><p className="text-sm font-medium">Cantiere del cliente</p><CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={collega}/></div>
          <Button variant="outline" className="min-h-10" onClick={() => { setScelta(false); setFinestra(true); }}><Plus className="size-4"/>Nuovo cantiere</Button>
        </div>}
      </DialogContent>
    </Dialog>
    {prezziId && cantierePrezzi && <PrezziCantiereDialog condizioniPrezzi={prev} open onOpenChange={o => { if (!o) setPrezziId(null); }} cantiere={cantierePrezzi}/>}
    {scheda && geo && <CantiereDialog condizioniPrezzi={prev} open={scheda} onOpenChange={setScheda} cantiere={geo} queryKeysExtra={[["cantiere-preventivo-posizione", c?.id], ["preventivo", prev.id]]}/>}
    {mappa && geo && <MappaCantierePreventivo open={mappa} onOpenChange={setMappa} cantiere={geo} sedi={sediMappa} sedeCliente={sedeCliente}/>}

    {finestra && soggettoFisso && <CantiereDialog
      condizioniPrezzi={prev}
      open={finestra}
      onOpenChange={setFinestra}
      soggettoFisso={soggettoFisso}
      onSalvato={(n) => { collega(n.id); qc.invalidateQueries({ queryKey: ["cantieri-lite", prev.cliente_id] }); }}
    />}
  </div></RiquadroScheda>;
}
