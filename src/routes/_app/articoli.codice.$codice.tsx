import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BackButton } from "@/components/back-button";
import { dettaglioArticoloGamma } from "@/lib/catalogo-articoli.functions";
import { SchedaArticoloGamma } from "@/components/articoli/SchedaArticoloGamma";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { tabSchedaArticolo } from "@/lib/scheda-articolo";

export const Route = createFileRoute("/_app/articoli/codice/$codice")({
  validateSearch: zodValidator(z.object({ tab: fallback(z.string(), "panoramica").default("panoramica") })),
  head: ({ params }) => ({ meta: [
    { title: `${params.codice} — Scheda articolo — FidiManager` },
    { name: "description", content: `Anagrafica, prezzi e dati tecnici dell’articolo ${params.codice}.` },
    { property: "og:title", content: `${params.codice} — Scheda articolo` },
    { property: "og:description", content: `Prezzi Gamma e dati tecnici Sistema MADE dell’articolo ${params.codice}.` },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SchedaGamma,
  errorComponent: ({ error }) => <div className="p-6"><BackButton fallbackTo="/articoli" fallbackLabel="Articoli" /><p role="alert" className="mt-4 text-destructive">{error instanceof Error ? error.message : String(error)}</p></div>,
});
function SchedaGamma() {
  const { codice } = Route.useParams();
  return <div className="mx-auto w-full max-w-7xl p-3 lg:p-6">
    <BackButton fallbackTo="/articoli" fallbackLabel="Articoli" />
    <Suspense fallback={<p className="py-6 text-muted-foreground">Caricamento articolo…</p>}><Intestazione codice={codice} /></Suspense>
  </div>;
}
function Intestazione({ codice }: { codice: string }) {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: a } = useSuspenseQuery({ queryKey: ["catalogo-articolo", codice], queryFn: () => dettaglioArticoloGamma({ data: { codice } }) });
  if (!a) return <p className="py-6 text-muted-foreground">Articolo non trovato.</p>;
  return <SchedaArticoloGamma articolo={a} tab={tabSchedaArticolo(tab)} onTabChange={(value) => void navigate({ search: (prev) => ({ ...prev, tab: value }), replace: true, resetScroll: false })} />;
}