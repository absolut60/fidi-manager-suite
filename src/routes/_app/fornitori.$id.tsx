import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BackButton } from "@/components/back-button";
import { SchedaFornitore } from "@/components/fornitori/SchedaFornitore";
import { AccessoFornitori, ErroreFornitori } from "@/components/fornitori/controlli-fornitori";
import { dettaglioFornitore } from "@/lib/fornitori.functions";
import { ricercaSchedaFornitore, tabSchedaFornitore, paginaFornitore } from "@/lib/scheda-fornitore";

export const Route = createFileRoute("/_app/fornitori/$id")({
  validateSearch: ricercaSchedaFornitore,
  head: () => ({ meta: [{ title: "Scheda fornitore — FidiManager" }, { name: "description", content: "Riepilogo, anagrafica, note interne, articoli, clienti collegati e allegati del fornitore MADE." }, { property: "og:title", content: "Scheda fornitore — FidiManager" }, { property: "og:description", content: "Dati Gamma, articoli forniti e clienti collegati." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaginaSchedaFornitore,
  errorComponent: ({ error }) => <div className="p-6"><BackButton fallbackTo="/fornitori" fallbackLabel="Fornitori" /><p role="alert" className="mt-3 text-destructive">{error instanceof Error ? error.message : "Impossibile caricare il fornitore."}</p></div>,
});
function PaginaSchedaFornitore() { return <AccessoFornitori><ContenutoSchedaFornitore /></AccessoFornitori>; }
function ContenutoSchedaFornitore() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const carica = useServerFn(dettaglioFornitore);
  const query = useQuery({ queryKey: ["fornitore", id], queryFn: () => carica({ data: { id } }) });
  useEffect(() => { if (query.data) document.title = `${query.data.ragione_sociale || "Fornitore"} — Scheda fornitore`; }, [query.data]);
  const cambiaRicerca = useCallback((qArticoli: string) => { void navigate({ search: prev => ({ ...prev, qArticoli, paginaArticoli: 1 }), replace: true, resetScroll: false }); }, [navigate]);
  return <div className="min-w-0 space-y-6"><div className="mb-2"><BackButton fallbackTo="/fornitori" fallbackLabel="Fornitori" /></div>{query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento fornitore…</p> : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} /> : !query.data ? <p className="py-6 text-muted-foreground">Fornitore non trovato.</p> : <SchedaFornitore key={id} fornitore={query.data} tab={tabSchedaFornitore(search.tab)} onTabChange={tab => void navigate({ search: prev => ({ ...prev, tab }), resetScroll: false })} statoArticoli={{ ricerca: search.qArticoli, preferenziali: search.preferenziali, pagina: paginaFornitore(search.paginaArticoli), cambiaRicerca, cambiaPreferenziali: preferenziali => void navigate({ search: prev => ({ ...prev, preferenziali, paginaArticoli: 1 }), resetScroll: false }), cambiaPagina: paginaArticoli => void navigate({ search: prev => ({ ...prev, paginaArticoli }), resetScroll: false }) }} />}</div>;
}