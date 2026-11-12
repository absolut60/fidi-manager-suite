import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search } from "lucide-react";
import { elencoFornitori } from "@/lib/fornitori.functions";
import { ricercaFornitori, paginaFornitore, filtroSiNo } from "@/lib/scheda-fornitore";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { AccessoFornitori, FiltroSiNo, ErroreFornitori, PaginazioneFornitori, useRicercaDifferita } from "@/components/fornitori/controlli-fornitori";

export const Route = createFileRoute("/_app/fornitori/")({
  validateSearch: ricercaFornitori,
  head: () => ({ meta: [{ title: "Fornitori — FidiManager" }, { name: "description", content: "Elenco fornitori MADE: anagrafiche Gamma, articoli e clienti collegati." }, { property: "og:title", content: "Fornitori — FidiManager" }, { property: "og:description", content: "Fornitori Gamma e manuali, articoli e collegamenti clienti." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaginaFornitori,
  errorComponent: ({ error }) => <p role="alert" className="p-6 text-destructive">{error instanceof Error ? error.message : "Impossibile caricare i fornitori."}</p>,
});
function PaginaFornitori() { return <AccessoFornitori><ContenutoFornitori /></AccessoFornitori>; }
function ContenutoFornitori() {
  const f = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagina = paginaFornitore(f.pagina);
  const aggiornaRicerca = useCallback((q: string) => { void navigate({ search: prev => ({ ...prev, q, pagina: 1 }), replace: true, resetScroll: false }); }, [navigate]);
  const [testo, setTesto] = useRicercaDifferita(f.q, aggiornaRicerca);
  const carica = useServerFn(elencoFornitori);
  const filtri = { testo: f.q, ancheCliente: filtroSiNo(f.ancheCliente), conArticoli: filtroSiNo(f.conArticoli), includiManuali: f.manuali, limite: 100, offset: (pagina - 1) * 100 };
  const query = useQuery({ queryKey: ["fornitori", filtri], queryFn: () => carica({ data: filtri }) });
  const cambia = (patch: Partial<typeof f>) => void navigate({ search: prev => ({ ...prev, ...patch, pagina: 1 }), resetScroll: false });
  return <div className="mx-auto w-full max-w-7xl space-y-4 p-3 lg:p-6"><header><h1 className="text-2xl font-bold text-navy">Fornitori</h1><div className="relative mt-3"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca fornitori" className="min-h-10 pl-9" placeholder="Nome, alias, codice, P.IVA/CF, città…" value={testo} onChange={e => setTesto(e.target.value)} /></div><div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_minmax(0,1fr)]"><FiltroSiNo label="Anche cliente" value={f.ancheCliente} onChange={ancheCliente => cambia({ ancheCliente })} /><FiltroSiNo label="Con articoli" value={f.conArticoli} onChange={conArticoli => cambia({ conArticoli })} /><label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={f.manuali} onCheckedChange={manuali => cambia({ manuali })} />Mostra fornitori manuali</label></div></header>{query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento fornitori…</p> : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} /> : <><ElencoFornitori rows={query.data.rows} apri={id => void navigate({ to: "/fornitori/$id", params: { id } })} /><PaginazioneFornitori totale={query.data.total} pagina={pagina} dimensione={100} nome="fornitori" onChange={pagina => void navigate({ search: prev => ({ ...prev, pagina }), resetScroll: true })} /></>}</div>;
}