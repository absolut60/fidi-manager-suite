/**
 * FM100 fetta 3 — grafico interattivo dei collegamenti Cerved (cliente e lead).
 * Dati solo da costruisciGrafoCerved + datiMadeGrafoCerved; d3-force solo per la disposizione, disegno SVG nostro.
 * Regole: docs/regole/cerved-grafo-collegati.md, sezione "Schermata".
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { Maximize2, Minus, Plus, RotateCcw, Crosshair } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/fidi";
import { chiaveFiscaleValida, costruisciGrafoCerved, percentualiArco, riepilogoGruppoMade, ruoliArco, type ArcoGrafo, type ClienteMadeGrafo, type GrafoCerved, type NodoGrafo } from "@/lib/cerved-grafo";
import { datiMadeGrafoCerved } from "@/lib/cerved/cerved-grafo.functions";
import type { EntitaCerved } from "@/lib/cerved/cerved-entita";

export type LinkClienteGrafo = (clienteId: string, contenuto: ReactNode) => ReactNode;
const linkPredefinito: LinkClienteGrafo = (clienteId, contenuto) => (
  <Button asChild size="sm" variant="outline" className="min-h-10"><Link to="/clienti/$clienteId" params={{ clienteId }} search={{ tab: "cerved" }}>{contenuto}</Link></Button>
);

const TIPO_NODO: Record<NodoGrafo["tipo"], string> = { centro: "Azienda del report", persona: "Persona", societa: "Società", societa_estera: "Società estera", solo_nome: "Nominativo (solo nome)" };
const GRUPPI_ELENCO: { tipo: string; titolo: string }[] = [
  { tipo: "socio", titolo: "Soci" }, { tipo: "titolare_effettivo", titolo: "Titolari effettivi" }, { tipo: "partecipazione", titolo: "Partecipazioni" },
  { tipo: "esponente", titolo: "Esponenti" }, { tipo: "societa_collegata", titolo: "Società collegate tramite esponenti" }, { tipo: "socio_principale", titolo: "Soci delle società socie" },
];
const SOGLIA_CLIC = 4;
const tronca = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rosso = (n: NodoGrafo) => n.stato === "procedura" || n.eventi.length > 0;

/** Clienti MADE abbinati a ciascun nodo: chiave fiscale del nodo; il centro ↔ clienti con chiave_centro. */
export function clientiPerNodo(grafo: GrafoCerved, clienti: ClienteMadeGrafo[]): Map<string, ClienteMadeGrafo[]> {
  const m = new Map<string, ClienteMadeGrafo[]>();
  for (const n of grafo.nodi) {
    const k = n.tipo === "centro" ? null : chiaveFiscaleValida(n.codice_fiscale);
    const v = n.tipo === "centro" ? clienti.filter((c) => c.chiave_centro) : k ? clienti.filter((c) => c.chiave === k && !c.chiave_centro) : [];
    const unici = [...new Map(v.map((c) => [c.cliente_id, c])).values()];
    if (unici.length) m.set(n.id, unici);
  }
  return m;
}

/** Filtro "Legami cessati": spento = archi non in corso nascosti e nodi rimasti isolati nascosti (mai il centro). */
export function filtraGrafo(grafo: GrafoCerved, mostraCessati: boolean): GrafoCerved {
  if (mostraCessati) return grafo;
  const archi = grafo.archi.filter((a) => a.in_corso);
  const usati = new Set(archi.flatMap((a) => [a.da, a.a]));
  return { nodi: grafo.nodi.filter((n) => n.tipo === "centro" || usati.has(n.id)), archi };
}

type NodoSim = SimulationNodeDatum & { id: string; nodo: NodoGrafo };
type ArcoSim = SimulationLinkDatum<NodoSim> & { arco: ArcoGrafo };
const raggio = (n: NodoGrafo) => (n.tipo === "centro" ? 28 : n.tipo === "solo_nome" ? 8 : n.tipo === "persona" ? 14 : 16);

function creaSimulazione(g: GrafoCerved) {
  const nodi: NodoSim[] = g.nodi.map((n, i) => {
    const ang = (i / Math.max(1, g.nodi.length)) * Math.PI * 2;
    return n.tipo === "centro" ? { id: n.id, nodo: n, x: 0, y: 0, fx: 0, fy: 0 } : { id: n.id, nodo: n, x: Math.cos(ang) * 100 * n.livello, y: Math.sin(ang) * 100 * n.livello };
  });
  const perId = new Map(nodi.map((n) => [n.id, n]));
  const archi: ArcoSim[] = g.archi.filter((a) => perId.has(a.da) && perId.has(a.a)).map((a) => ({ source: a.da, target: a.a, arco: a }));
  const sim = forceSimulation(nodi)
    .force("link", forceLink<NodoSim, ArcoSim>(archi).id((d) => d.id).distance((l) => {
      const s = l.source as NodoSim, t = l.target as NodoSim;
      return Math.max(s.nodo.livello, t.nodo.livello) >= 2 ? 130 : 90;
    }))
    .force("carica", forceManyBody().strength(-300))
    .force("urto", forceCollide<NodoSim>().radius((d) => raggio(d.nodo) + 26))
    .force("x", forceX(0).strength(0.03)).force("y", forceY(0).strength(0.03))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();
  return { sim, nodi, archi };
}

type Vista = { k: number; x: number; y: number };
function adatta(nodi: NodoSim[], w: number, h: number): Vista {
  if (!nodi.length) return { k: 1, x: w / 2, y: h / 2 };
  const xs = nodi.map((n) => n.x ?? 0), ys = nodi.map((n) => n.y ?? 0);
  const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 50;
  const k = Math.min(1.1, Math.max(0.2, Math.min(w / (maxX - minX), h / (maxY - minY))));
  return { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
}

/** Spostamento dal centro del nodo al suo bordo verso (dx,dy), più 3 px di margine per la punta. */
function bordoNodo(n: NodoGrafo, dx: number, dy: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, r = raggio(n), m = 3;
  if (n.tipo === "persona" || n.tipo === "solo_nome" || n.tipo === "centro") return { x: ux * (r + m), y: uy * (r + m) };
  const hw = r + 6, hh = Math.max(1, r - 3);
  const t = Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
  return { x: ux * (t + m), y: uy * (t + m) };
}

function TelaGrafo({ grafo, perNodo, interattivo, schermoIntero = false, evidenziaMade, evidenziaEventi, onApri, onAnteprima, classeAltezza }: {
  grafo: GrafoCerved; perNodo: Map<string, ClienteMadeGrafo[]>; interattivo: boolean; schermoIntero?: boolean;
  evidenziaMade: boolean; evidenziaEventi: boolean; onApri: (id: string) => void; onAnteprima?: () => void; classeAltezza: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 520 });
  const [, setTick] = useState(0);
  const firma = grafo.nodi.map((n) => n.id).join("|") + "#" + grafo.archi.length;
  const motore = useMemo(() => creaSimulazione(grafo), [firma]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vista, setVista] = useState<Vista>(() => adatta(motore.nodi, 800, 520));
  const [attivo, setAttivo] = useState<string | null>(null);
  const idFreccia = `freccia-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ tipo: "nodo" | "vista"; id?: string; x0: number; y0: number; mosso: boolean; vista0: Vista; pinch?: { d: number; k: number } } | null>(null);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 0) setDim({ w: r.width, h: r.height }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { setVista(adatta(motore.nodi, dim.w, dim.h)); }, [motore, dim.w, dim.h]);
  useEffect(() => {
    const s: Simulation<NodoSim, ArcoSim> = motore.sim;
    s.on("tick", () => setTick((t) => t + 1));
    return () => { s.on("tick", null); s.stop(); };
  }, [motore]);
  // Ctrl/⌘ + rotella = zoom; la rotella da sola scorre la pagina.
  useEffect(() => {
    const el = svg.current; if (!el || !interattivo) return;
    const ruota = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomIn(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", ruota, { passive: false });
    return () => el.removeEventListener("wheel", ruota);
  });

  function zoomIn(cx: number, cy: number, f: number) {
    setVista((v) => { const k = Math.min(4, Math.max(0.15, v.k * f)); const r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; });
  }
  const mondo = (cx: number, cy: number) => ({ x: (cx - vista.x) / vista.k, y: (cy - vista.y) / vista.k });
  const locale = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function giu(e: React.PointerEvent, id?: string) {
    if (!interattivo) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = locale(e);
    puntatori.current.set(e.pointerId, p);
    if (puntatori.current.size === 2) {
      const [a, b] = [...puntatori.current.values()];
      gesto.current = { tipo: "vista", x0: p.x, y0: p.y, mosso: true, vista0: vista, pinch: { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: vista.k } };
      return;
    }
    gesto.current = { tipo: id ? "nodo" : "vista", id, x0: p.x, y0: p.y, mosso: false, vista0: vista };
  }
  function muovi(e: React.PointerEvent) {
    const g = gesto.current; if (!g || !puntatori.current.has(e.pointerId)) return;
    const p = locale(e);
    puntatori.current.set(e.pointerId, p);
    if (g.pinch && puntatori.current.size >= 2) {
      const [a, b] = [...puntatori.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const cx = (a!.x + b!.x) / 2, cy = (a!.y + b!.y) / 2;
      setVista((v) => { const k = Math.min(4, Math.max(0.15, g.pinch!.k * (d / g.pinch!.d))); const r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; });
      return;
    }
    if (!g.mosso && Math.hypot(p.x - g.x0, p.y - g.y0) < SOGLIA_CLIC) return;
    g.mosso = true;
    if (g.tipo === "nodo" && g.id) {
      const n = motore.nodi.find((x) => x.id === g.id); if (!n) return;
      const w = mondo(p.x, p.y); n.fx = w.x; n.fy = w.y;
      motore.sim.alphaTarget(0.3).restart();
    } else setVista({ ...g.vista0, x: g.vista0.x + p.x - g.x0, y: g.vista0.y + p.y - g.y0 });
  }
  function su(e: React.PointerEvent) {
    const g = gesto.current;
    puntatori.current = new Map([...puntatori.current].filter(([k]) => k !== e.pointerId));
    if (!g) return;
    if (puntatori.current.size > 0) return;
    gesto.current = null;
    if (g.tipo === "nodo") { motore.sim.alphaTarget(0); if (!g.mosso && g.id) onApri(g.id); }
  }
  const riordina = () => { for (const n of motore.nodi) if (n.nodo.tipo !== "centro") { n.fx = null; n.fy = null; } motore.sim.alpha(0.8).alphaTarget(0).restart(); };

  const archiAttivi = (a: ArcoGrafo) => attivo != null && (a.da === attivo || a.a === attivo);
  const attenuato = (n: NodoGrafo) => (evidenziaMade && !perNodo.has(n.id) && n.tipo !== "centro") || (evidenziaEventi && !rosso(n) && n.tipo !== "centro");
  const pos = new Map(motore.nodi.map((n) => [n.id, n]));
  const nRossi = grafo.nodi.filter(rosso).length;
  const aria = `Grafico dei collegamenti: ${grafo.nodi.length - 1} soggetti collegati, ${grafo.archi.length} legami${nRossi ? `, ${nRossi} con eventi negativi o procedure` : ""}${perNodo.size ? `, ${perNodo.size} già clienti MADE` : ""}.`;

  return (
    <div ref={box} className={cn("relative w-full overflow-hidden rounded-md border bg-muted/20", classeAltezza)}
      style={{ touchAction: interattivo && schermoIntero ? "none" : "auto" }}
      onClick={!interattivo ? onAnteprima : undefined}>
      <svg ref={svg} role="img" aria-label={aria} width="100%" height="100%" className={cn("block select-none", interattivo ? "cursor-grab" : "cursor-pointer")}
        onPointerDown={(e) => giu(e)} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}>
        <defs><marker id={idFreccia} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" fillOpacity={0.6} />
        </marker></defs>
        <g transform={`translate(${vista.x},${vista.y}) scale(${vista.k})`}>
          {motore.archi.map((l) => {
            const s = l.source as NodoSim, t = l.target as NodoSim;
            if (!pos.has(s.id) || !pos.has(t.id)) return null;
            const sx = s.x ?? 0, sy = s.y ?? 0, tx0 = t.x ?? 0, ty0 = t.y ?? 0;
            const fine = bordoNodo(t.nodo, sx - tx0, sy - ty0);
            const tx = tx0 + fine.x, ty = ty0 + fine.y;
            const mx = (sx + tx) / 2, my = (sy + ty) / 2;
            const fioco = attenuato(s.nodo) && attenuato(t.nodo);
            const perc = percentualiArco(l.arco), ruoli = archiAttivi(l.arco) ? ruoliArco(l.arco) : "";
            const lp = perc.length * 5 + 8;
            return <g key={l.arco.id} data-arco={l.arco.id} data-in-corso={l.arco.in_corso} opacity={fioco ? 0.2 : 1}>
              <line x1={sx} y1={sy} x2={tx} y2={ty} className="stroke-muted-foreground" strokeWidth={1.2} strokeDasharray={l.arco.in_corso ? undefined : "5 4"} strokeOpacity={0.6} markerEnd={`url(#${idFreccia})`} />
              {perc && <g data-percentuale transform={`translate(${mx},${my})`}>
                <rect x={-lp / 2} y={-7} width={lp} height={13} rx={6} fill="var(--background)" className="stroke-border" strokeWidth={0.8} />
                <text textAnchor="middle" y={3} fontSize={9} fontWeight={700} className="fill-foreground">{perc}</text>
              </g>}
              {ruoli && <text data-ruoli x={mx} y={my + (perc ? 17 : 3)} textAnchor="middle" className="fill-muted-foreground" fontSize={8} paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{tronca(ruoli, 34)}</text>}
            </g>;
          })}
          {motore.nodi.map((s) => {
            const n = s.nodo, r = raggio(n), clienti = perNodo.get(n.id) ?? [];
            const bordo = rosso(n) ? "stroke-destructive" : n.stato === "attiva" ? "stroke-success" : n.tipo === "centro" ? "stroke-primary" : "stroke-muted-foreground";
            const tratt = n.tipo === "societa_estera" || n.tipo === "solo_nome" ? "4 3" : undefined;
            const op = attenuato(n) ? 0.25 : n.stato === "cessata" ? 0.55 : 1;
            const bloccato = clienti.some((c) => c.bloccato), legale = clienti.some((c) => c.in_gestione_legale);
            return <g key={n.id} data-nodo={n.id} transform={`translate(${s.x ?? 0},${s.y ?? 0})`} opacity={op}
              tabIndex={0} role="button" aria-label={`${n.nome}${clienti.length ? ", cliente MADE" : ""}${rosso(n) ? ", eventi negativi" : ""}`}
              className="cursor-pointer outline-none focus-visible:[&>*:first-child]:stroke-[3]"
              onPointerDown={(e) => (interattivo ? giu(e, n.id) : undefined)} onPointerEnter={() => setAttivo(n.id)} onPointerLeave={() => setAttivo((a) => (a === n.id ? null : a))}
              onFocus={() => setAttivo(n.id)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApri(n.id); } }}>
              {n.tipo === "persona" || n.tipo === "solo_nome" || n.tipo === "centro"
                ? <circle r={r} className={cn(n.tipo === "centro" ? "fill-primary" : "fill-card", bordo)} strokeWidth={n.tipo === "centro" ? 3 : 2} strokeDasharray={tratt} />
                : <rect x={-r - 6} y={-r + 3} width={(r + 6) * 2} height={(r - 3) * 2} rx={5} className={cn("fill-card", bordo)} strokeWidth={2} strokeDasharray={tratt} />}
              {clienti.length > 0 && n.tipo !== "centro" && <g data-targhetta-made transform={`translate(0,${-r - 7})`}>
                <rect x={-17} y={-7} width={34} height={13} rx={3} className="fill-primary" />
                <text textAnchor="middle" y={3} fontSize={8} fontWeight={700} className="fill-primary-foreground">MADE</text>
                {(bloccato || legale) && <text textAnchor="middle" y={-10} fontSize={7} fontWeight={600} className="fill-destructive">{[bloccato && "bloccato", legale && "in legale"].filter(Boolean).join(" · ")}</text>}
              </g>}
              <text y={r + 12} textAnchor="middle" fontSize={n.tipo === "centro" ? 11 : 9} fontWeight={n.tipo === "centro" ? 700 : 500} className="fill-foreground" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{tronca(n.nome)}</text>
            </g>;
          })}
        </g>
      </svg>
      {interattivo ? <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Button type="button" size="icon" variant="outline" className="h-10 w-10" aria-label="Ingrandisci" onClick={() => zoomIn(dim.w / 2, dim.h / 2, 1.25)}><Plus className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-10 w-10" aria-label="Riduci" onClick={() => zoomIn(dim.w / 2, dim.h / 2, 1 / 1.25)}><Minus className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-10 w-10" aria-label="Centra" onClick={() => setVista(adatta(motore.nodi, dim.w, dim.h))}><Crosshair className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-10 w-10" aria-label="Riordina" onClick={riordina}><RotateCcw className="h-4 w-4" /></Button>
      </div> : <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm"><Maximize2 className="h-4 w-4" />Apri a schermo intero</span>
      </div>}
    </div>
  );
}

function testoTotali(t: { fido: number; esposizione: number; scaduto: number; scaduto_oltre_60: number }) {
  return `fido ${formatEuro(t.fido)} · esposizione ${formatEuro(t.esposizione)} · scaduto ${formatEuro(t.scaduto)} (oltre 60 gg ${formatEuro(t.scaduto_oltre_60)})`;
}
export function RiepilogoMadeGrafo({ clienti, entita }: { clienti: ClienteMadeGrafo[]; entita: EntitaCerved }) {
  const r = riepilogoGruppoMade(clienti);
  const leadCliente = entita === "lead" ? clienti.find((c) => c.chiave_centro) : undefined;
  if (!r.altri.clienti && !leadCliente) return null;
  return <div className="space-y-1 rounded-md border-l-4 border-l-primary bg-primary/5 p-3 text-sm">
    {leadCliente && <p className="break-words font-medium">Questo lead è già cliente MADE: {leadCliente.ragione_sociale ?? "—"}{leadCliente.codice ? ` (${leadCliente.codice})` : ""}</p>}
    {r.altri.clienti > 0 && <p className="break-words"><span className="font-semibold">{r.altri.clienti} {r.altri.clienti === 1 ? "società/persona collegata è già cliente MADE" : "società/persone collegate sono già clienti MADE"}</span> — {testoTotali(r.altri)}</p>}
    {entita === "cliente" && r.altri.clienti > 0 && r.questo.clienti > 0 && <p className="break-words text-muted-foreground">Gruppo incluso questo cliente: {testoTotali(r.totale)}</p>}
  </div>;
}

export function DettaglioNodoGrafo({ nodo, grafo, clienti, linkCliente = linkPredefinito }: { nodo: NodoGrafo; grafo: GrafoCerved; clienti: ClienteMadeGrafo[]; linkCliente?: LinkClienteGrafo }) {
  const perId = new Map(grafo.nodi.map((n) => [n.id, n]));
  const legami = grafo.archi.filter((a) => a.da === nodo.id || a.a === nodo.id);
  return <div className="space-y-4 text-sm">
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{TIPO_NODO[nodo.tipo]}{nodo.codice_fiscale ? ` · ${nodo.codice_fiscale}` : ""}</p>
      {nodo.stato_testo && <p className={cn("font-medium", nodo.stato === "attiva" && "text-success", nodo.stato === "procedura" && "text-destructive")}>{nodo.stato_testo}</p>}
      {nodo.dettagli.length > 0 && <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1">{nodo.dettagli.map((d) => <Fragment key={d.etichetta}><dt className="text-muted-foreground">{d.etichetta}</dt><dd className="break-words">{d.valore}</dd></Fragment>)}</dl>}
      {nodo.eventi.length > 0 && <ul className="space-y-0.5">{nodo.eventi.map((e) => <li key={e} className="break-words text-destructive">{e}</li>)}</ul>}
    </div>
    {legami.length > 0 && <div><h4 className="mb-1 font-semibold">Legami</h4><ul className="divide-y divide-border">{legami.map((a) => {
      const altro = perId.get(a.da === nodo.id ? a.a : a.da);
      return <li key={a.id} className="py-1.5"><p className="break-words font-medium">{altro?.nome ?? "—"}</p><p className="break-words text-muted-foreground">{a.etichette.join(" · ")}{a.in_corso ? "" : " · cessato"}</p></li>;
    })}</ul></div>}
    {clienti.map((c) => <div key={c.cliente_id} className="space-y-2 rounded-md border-l-4 border-l-primary bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2"><Badge>MADE</Badge>{c.bloccato && <Badge variant="destructive">Bloccato</Badge>}{c.in_gestione_legale && <Badge variant="destructive">In legale</Badge>}{c.e_questo_cliente && <Badge variant="outline">Questo cliente</Badge>}</div>
      <p className="break-words font-semibold">{c.ragione_sociale ?? "—"}{c.codice ? ` (${c.codice})` : ""}</p>
      {c.sede && <p className="text-muted-foreground">{c.sede}</p>}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["Fido", c.fido], ["Esposizione", c.esposizione], ["Scaduto", c.scaduto], ["Oltre 60 gg", c.scaduto_oltre_60]] as const).map(([e, v]) => <div key={e}><dt className="text-xs text-muted-foreground">{e}</dt><dd className="font-medium">{formatEuro(v)}</dd></div>)}
      </dl>
      {c.visibile && !c.e_questo_cliente && linkCliente(c.cliente_id, "Apri scheda cliente")}
    </div>)}
  </div>;
}

export function ElencoGrafo({ grafo, perNodo, onApri }: { grafo: GrafoCerved; perNodo: Map<string, ClienteMadeGrafo[]>; onApri: (id: string) => void }) {
  const perId = new Map(grafo.nodi.map((n) => [n.id, n]));
  const gruppi = GRUPPI_ELENCO.map((g) => ({ ...g, righe: grafo.archi.filter((a) => a.tipi.includes(g.tipo)).map((a) => {
    // Partecipazioni e società collegate: l'altro capo è la destinazione; negli altri legami è l'origine.
    const altroId = g.tipo === "partecipazione" || g.tipo === "societa_collegata" ? a.a : a.da;
    return { a, n: perId.get(altroId), da: g.tipo === "societa_collegata" && a.da !== "centro" ? perId.get(a.da)?.nome : null };
  }) })).filter((g) => g.righe.length);
  if (!gruppi.length) return <p className="text-sm text-muted-foreground">Nessun legame da mostrare.</p>;
  return <div className="space-y-4">{gruppi.map((g) => <section key={g.tipo} aria-label={g.titolo}>
    <h4 className="mb-1 text-sm font-semibold">{g.titolo}</h4>
    <ul className="divide-y divide-border">{g.righe.map(({ a, n, da }) => n && <li key={`${g.tipo}-${a.id}`}>
      <button type="button" className="flex min-h-10 w-full flex-col items-start gap-0.5 py-1.5 text-left text-sm hover:bg-muted/40" onClick={() => onApri(n.id)}>
        <span className="flex w-full flex-wrap items-center gap-2"><span className={cn("min-w-0 break-words font-medium", n.stato === "cessata" && "text-muted-foreground")}>{n.nome}</span>{perNodo.has(n.id) && <Badge className="shrink-0">MADE</Badge>}{n.stato_testo && <span className={cn("text-xs", n.stato === "attiva" ? "text-success" : n.stato === "procedura" ? "text-destructive" : "text-muted-foreground")}>{n.stato_testo}</span>}</span>
        <span className="break-words text-xs text-muted-foreground">{da ? `${da}: ` : ""}{a.etichette.join(" · ")}{a.in_corso ? "" : " · cessato"}</span>
        {n.eventi.length > 0 && <span className="break-words text-xs text-destructive">{n.eventi.join("; ")}</span>}
      </button>
    </li>)}</ul>
  </section>)}</div>;
}

function usePuntatoreGrossolano() {
  const [g, setG] = useState(false);
  useEffect(() => { const m = window.matchMedia("(pointer: coarse)"); const f = () => setG(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return g;
}

const Interruttore = ({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: ReactNode }) =>
  <Button type="button" size="sm" variant={attivo ? "default" : "outline"} aria-pressed={attivo} className="min-h-10" onClick={onClick}>{children}</Button>;

/** Parte presentazionale (dati già pronti): riusabile nei test. */
export function VistaGrafoCollegati({ grafo, clienti, entita, pagina = false, vistaIniziale = "grafico", cessatiIniziali = false, linkCliente }: {
  grafo: GrafoCerved; clienti: ClienteMadeGrafo[]; entita: EntitaCerved; pagina?: boolean;
  vistaIniziale?: "grafico" | "elenco"; cessatiIniziali?: boolean; linkCliente?: LinkClienteGrafo;
}) {
  const [vista, setVista] = useState(vistaIniziale);
  const [cessati, setCessati] = useState(cessatiIniziali);
  const [made, setMade] = useState(false);
  const [eventi, setEventi] = useState(false);
  const [aperto, setAperto] = useState<string | null>(null);
  const [intero, setIntero] = useState(false);
  const grossolano = usePuntatoreGrossolano();
  const visibile = useMemo(() => filtraGrafo(grafo, cessati), [grafo, cessati]);
  const perNodo = useMemo(() => clientiPerNodo(grafo, clienti), [grafo, clienti]);
  if (grafo.nodi.length <= 1) return null;
  const nCessati = grafo.archi.filter((a) => !a.in_corso).length;
  const nodoAperto = aperto ? grafo.nodi.find((n) => n.id === aperto) : undefined;
  const filtri = <div className="flex flex-wrap gap-2">
    <Interruttore attivo={cessati} onClick={() => setCessati((v) => !v)}>Legami cessati ({nCessati})</Interruttore>
    {vista === "grafico" && <><Interruttore attivo={made} onClick={() => setMade((v) => !v)}>Evidenzia clienti MADE</Interruttore>
      <Interruttore attivo={eventi} onClick={() => setEventi((v) => !v)}>Evidenzia eventi negativi</Interruttore></>}
  </div>;
  const tela = (interattivo: boolean, schermoIntero: boolean, classe: string) => <TelaGrafo grafo={visibile} perNodo={perNodo} interattivo={interattivo} schermoIntero={schermoIntero}
    evidenziaMade={made} evidenziaEventi={eventi} onApri={setAperto} onAnteprima={() => setIntero(true)} classeAltezza={classe} />;

  return <section aria-label="Grafico dei collegamenti" className={cn(pagina && "col-span-full")}>
    <Card className="rounded-md border-l-4 border-l-primary"><CardContent className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Grafico dei collegamenti</h3>
        <div role="group" aria-label="Vista" className="inline-flex rounded-md border p-0.5">
          {(["grafico", "elenco"] as const).map((v) => <Button key={v} type="button" size="sm" variant={vista === v ? "default" : "ghost"} aria-pressed={vista === v} className="min-h-10" onClick={() => setVista(v)}>{v === "grafico" ? "Grafico" : "Elenco"}</Button>)}
        </div>
      </div>
      <RiepilogoMadeGrafo clienti={clienti} entita={entita} />
      {filtri}
      {vista === "grafico"
        ? tela(!grossolano, false, "h-[300px] md:h-[440px] lg:h-[520px] xl:h-[600px]")
        : <ElencoGrafo grafo={visibile} perNodo={perNodo} onApri={setAperto} />}
    </CardContent></Card>

    <Dialog open={intero} onOpenChange={setIntero}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 overflow-hidden rounded-none p-3">
        <DialogHeader><DialogTitle>Grafico dei collegamenti</DialogTitle><DialogDescription>Un dito sposta un nodo o la vista, due dita ingrandiscono.</DialogDescription></DialogHeader>
        {filtri}
        <div className="min-h-0 flex-1">{intero && tela(true, true, "h-full")}</div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!nodoAperto} onOpenChange={(o) => !o && setAperto(null)}>
      <DialogContent className="max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[85dvh] max-sm:w-full max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-t-lg sm:max-w-xl">
        {nodoAperto && <><DialogHeader><DialogTitle className="break-words pr-8 leading-snug">{nodoAperto.nome}</DialogTitle><DialogDescription className="sr-only">Dettaglio del soggetto collegato</DialogDescription></DialogHeader>
          <DettaglioNodoGrafo nodo={nodoAperto} grafo={grafo} clienti={perNodo.get(nodoAperto.id) ?? []} linkCliente={linkCliente} /></>}
      </DialogContent>
    </Dialog>
  </section>;
}

export function GrafoCollegatiCerved({ lr, entita, id, pagina = false }: { lr: Record<string, any>; entita: EntitaCerved; id: string | null | undefined; pagina?: boolean }) {
  const a = lr.anagrafica;
  const grafo = useMemo(() => costruisciGrafoCerved(lr as Parameters<typeof costruisciGrafoCerved>[0], { nome: a?.denominazione ?? null, partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null }), [lr]); // eslint-disable-line react-hooks/exhaustive-deps
  const leggi = useServerFn(datiMadeGrafoCerved);
  const q = useQuery({ queryKey: ["cerved-grafo-made", entita, id], enabled: !!id && grafo.nodi.length > 1, staleTime: 5 * 60_000, queryFn: () => leggi({ data: { entita, id: id! } }) });
  if (grafo.nodi.length <= 1) return null;
  return <VistaGrafoCollegati grafo={grafo} clienti={q.data?.clienti ?? []} entita={entita} pagina={pagina} />;
}
