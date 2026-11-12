import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { SchedaLista } from "@/components/lista-responsive/scheda-lista";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { FILTRI_ARTICOLI, STATI_ARTICOLI, prezzoArticolo, type FiltriArticoli } from "@/lib/catalogo-articoli";
import { elencoArticoliGamma, facetsArticoliGamma, fornitoriArticoliGamma } from "@/lib/catalogo-articoli.functions";

export const Route = createFileRoute("/_app/articoli/")({
  head: () => ({ meta: [{ title: "Articoli Gamma — FidiManager" }, { name: "description", content: "Catalogo articoli MADE con prezzi Gamma, disponibilità e filtri di famiglia, marca e fornitore." }, { property: "og:title", content: "Articoli Gamma — FidiManager" }, { property: "og:description", content: "Catalogo, prezzi e disponibilità degli articoli MADE." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ArticoliListPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-destructive">{error.message}</div>,
});
function useDebounce(value: string) {
  const [v, set] = useState(value);
  useEffect(() => { const t = setTimeout(() => set(value), 300); return () => clearTimeout(t); }, [value]);
  return v;
}
function ArticoliListPage() {
  const { user } = useAuth();
  const { filtri: f, setParziale } = useFiltriPagina("articoli-gamma", FILTRI_ARTICOLI, { userId: user?.id, valida: { famiglie: Array.isArray, sottofamiglie: Array.isArray, marche: Array.isArray, fornitori: Array.isArray, stati: Array.isArray } });
  const [aperti, setAperti] = useState(false);
  const [cercaFornitore, setCercaFornitore] = useState("");
  const search = useDebounce(f.search);
  const testoFornitore = useDebounce(cercaFornitore);
  const cambia = (patch: Partial<FiltriArticoli>) => setParziale({ ...patch, page: 1 });
  return <div className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b bg-card px-3 py-3 lg:px-6">
      <h1 className="text-xl font-bold text-navy">Articoli</h1>
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca articoli" className="h-10 pl-9" placeholder="Codice, descrizione, codice a barre o fornitore…" value={f.search} onChange={e => cambia({ search: e.target.value })} /></div>
        <Button variant="outline" className="h-10 lg:hidden" aria-expanded={aperti} onClick={() => setAperti(!aperti)}><SlidersHorizontal className="mr-2 size-4" />Filtri</Button>
      </div>
      <Suspense fallback={<p className="py-2 text-sm text-muted-foreground">Caricamento filtri…</p>}><Filtri f={f} cambia={cambia} aperti={aperti} testoFornitore={testoFornitore} cercaFornitore={setCercaFornitore} /></Suspense>
    </header>
    <Suspense fallback={<p className="p-6 text-muted-foreground">Caricamento articoli…</p>}><Risultati f={{ ...f, search }} setPage={page => setParziale({ page })} /></Suspense>
  </div>;
}
function Filtri({ f, cambia, aperti, testoFornitore, cercaFornitore }: { f: FiltriArticoli; cambia: (p: Partial<FiltriArticoli>) => void; aperti: boolean; testoFornitore: string; cercaFornitore: (s: string) => void }) {
  const { data: facets } = useSuspenseQuery({ queryKey: ["catalogo-articoli-facets"], queryFn: () => facetsArticoliGamma(), staleTime: 60000 });
  const { data: fornitori = [], error: erroreFornitori } = useQuery({ queryKey: ["catalogo-articoli-fornitori", testoFornitore, f.fornitori], queryFn: () => fornitoriArticoliGamma({ data: { testo: testoFornitore, selezionati: f.fornitori } }) });
  const opzioni = (items: { codice: string; descrizione: string | null; conteggio: number }[]) => Array.from(items.reduce((map, x) => {
    const previous = map.get(x.codice);
    map.set(x.codice, { ...x, conteggio: x.conteggio + (previous?.conteggio ?? 0) });
    return map;
  }, new Map<string, { codice: string; descrizione: string | null; conteggio: number }>()).values()).map(x => ({ valore: x.codice, label: `${x.descrizione || x.codice} (${x.conteggio.toLocaleString("it-IT")})` }));
  return <div className={`${aperti ? "grid" : "hidden"} mt-3 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-4 xl:grid-cols-6`}>
    <FiltroMultiplo etichetta="Famiglia" testoTutti="Tutte le famiglie" cercabile opzioni={opzioni(facets.famiglie)} selezionati={f.famiglie} onChange={famiglie => cambia({ famiglie, sottofamiglie: [] })} />
    <FiltroMultiplo etichetta="Sottofamiglia" testoTutti="Tutte le sottofamiglie" cercabile opzioni={opzioni(facets.sottofamiglie.filter(s => !f.famiglie.length || f.famiglie.includes(s.famiglia ?? "")))} selezionati={f.sottofamiglie} onChange={sottofamiglie => cambia({ sottofamiglie })} />
    <FiltroMultiplo etichetta="Marca" testoTutti="Tutte le marche" cercabile opzioni={opzioni(facets.marche)} selezionati={f.marche} onChange={marche => cambia({ marche })} />
    <div className="min-w-0"><FiltroMultiplo etichetta="Fornitore" testoTutti="Tutti i fornitori" cercabile onCercaChange={cercaFornitore} opzioni={fornitori.map(x => ({ valore: x.id, label: x.ragione_sociale }))} selezionati={f.fornitori} onChange={fornitori => cambia({ fornitori })} />{erroreFornitori && <p role="alert" className="text-xs text-destructive">Ricerca fornitori non disponibile</p>}</div>
    <FiltroMultiplo etichetta="Stato" testoTutti="Tutti gli stati" opzioni={STATI_ARTICOLI} selezionati={f.stati} onChange={stati => cambia({ stati })} />
    <Select value={String(f.listino)} onValueChange={v => cambia({ listino: Number(v) })}><SelectTrigger aria-label="Listino" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{facets.listini.map(l => <SelectItem key={l.codice} value={String(l.codice)}>{l.codice} {l.descrizione}</SelectItem>)}</SelectContent></Select>
    <label className="flex min-h-10 items-center gap-2 text-sm lg:col-span-2"><Switch checked={f.soloDisponibili} onCheckedChange={soloDisponibili => cambia({ soloDisponibili })} />Solo con disponibilità</label>
  </div>;
}
function Risultati({ f, setPage }: { f: FiltriArticoli; setPage: (p: number) => void }) {
  const navigate = useNavigate();
  const { data } = useSuspenseQuery({ queryKey: ["catalogo-articoli", f], queryFn: () => elencoArticoliGamma({ data: f }) });
  const pages = Math.max(1, Math.ceil(data.total / 100));
  type Riga = (typeof data.rows)[number];
  const apri = (a: Riga) => { if (a.origine === "gamma" && a.codice) void navigate({ to: "/articoli/codice/$codice", params: { codice: a.codice } }); else if (a.preventivatore_id) void navigate({ to: "/articoli/$id", params: { id: a.preventivatore_id } }); };
  const stato = (a: Riga) => <Badge variant="secondary" className="max-w-full whitespace-normal text-center">{STATI_ARTICOLI.find(s => s.valore === a.stato_gamma)?.label ?? a.stato_gamma}</Badge>;
  const disponibile = (a: Riga) => a.disponibilita_totale === null ? "—" : a.disponibilita_totale.toLocaleString("it-IT", { maximumFractionDigits: 3 });
  return <><div className="min-h-0 flex-1 overflow-auto p-3 lg:p-0">
    {!data.rows.length && <p className="p-6 text-center text-muted-foreground">Nessun articolo trovato.</p>}
    <div className="space-y-2 lg:hidden">{data.rows.map(a => <SchedaLista key={a.origine + (a.codice ?? a.preventivatore_id)} onClick={() => apri(a)} titolo={<><span className="block font-mono text-xs text-muted-foreground">{a.codice ?? "Senza codice Gamma"}</span><span className="line-clamp-2">{a.descrizione}</span></>} badge={stato(a)} campi={[{ etichetta: "Marca", valore: a.marca ?? "—" }, { etichetta: "Famiglia / Sottofamiglia", valore: [a.famiglia,a.sottofamiglia].filter(Boolean).join(" / ") || "—" }, { etichetta: "U.M.", valore: a.um ?? "—" }, { etichetta: "Prezzo", valore: prezzoArticolo(a.prezzo) }, { etichetta: "Disponibilità", valore: disponibile(a) }]} />)}</div>
    <table className="hidden w-full table-fixed text-xs lg:table"><colgroup><col className="w-[13%]"/><col className="w-[26%]"/><col className="w-[12%]"/><col className="w-[15%]"/><col className="w-[4%]"/><col className="w-[10%]"/><col className="w-[9%]"/><col className="w-[11%]"/></colgroup><thead className="sticky top-0 bg-navy text-navy-foreground"><tr>{["Codice","Descrizione","Marca","Famiglia / Sottofamiglia","U.M.","Prezzo","Disponibilità","Stato"].map(t => <th key={t} className="break-words px-2 py-3 text-left">{t}</th>)}</tr></thead><tbody>{data.rows.map(a => <tr key={a.origine + (a.codice ?? a.preventivatore_id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") apri(a); }} onClick={() => apri(a)} className="cursor-pointer border-b hover:bg-muted/50"><td className="break-words px-2 py-3 font-mono">{a.codice ?? "—"}</td><td className="break-words px-2 py-3 font-medium">{a.descrizione}</td><td className="break-words px-2 py-3">{a.marca ?? "—"}</td><td className="break-words px-2 py-3">{a.famiglia ?? "—"}<span className="block text-muted-foreground">{a.sottofamiglia}</span></td><td className="px-2 py-3">{a.um ?? "—"}</td><td className="px-2 py-3 text-right tabular-nums">{prezzoArticolo(a.prezzo)}</td><td className="px-2 py-3 text-right tabular-nums">{disponibile(a)}</td><td className="px-2 py-3">{stato(a)}</td></tr>)}</tbody></table>
  </div><footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-3 py-3 text-xs lg:px-6"><span>{data.total.toLocaleString("it-IT")} articoli · {f.page}/{pages}</span><div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Pagina precedente" disabled={f.page <= 1} onClick={() => setPage(f.page - 1)}><ChevronLeft className="size-4"/></Button><Button size="icon" variant="outline" aria-label="Pagina successiva" disabled={f.page >= pages} onClick={() => setPage(f.page + 1)}><ChevronRight className="size-4"/></Button></div></footer></>;
}
