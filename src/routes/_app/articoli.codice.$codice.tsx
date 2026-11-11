import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BackButton } from "@/components/back-button";
import { dettaglioArticoloGamma } from "@/lib/catalogo-articoli.functions";

export const Route = createFileRoute("/_app/articoli/codice/$codice")({
  head: ({ params }) => ({ meta: [
    { title: `${params.codice} — Articolo Gamma — FidiManager` },
    { name: "description", content: `Scheda catalogo Gamma dell’articolo ${params.codice}.` },
    { property: "og:title", content: `${params.codice} — Articolo Gamma` },
    { property: "og:description", content: `Descrizione e marca dell’articolo ${params.codice} nel catalogo MADE.` },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SchedaGamma,
});
function SchedaGamma() {
  const { codice } = Route.useParams();
  return <div className="mx-auto w-full max-w-7xl p-3 lg:p-6">
    <BackButton fallbackTo="/articoli" fallbackLabel="Articoli" />
    <Suspense fallback={<p className="py-6 text-muted-foreground">Caricamento articolo…</p>}><Intestazione codice={codice} /></Suspense>
  </div>;
}
function Intestazione({ codice }: { codice: string }) {
  const { data: a } = useSuspenseQuery({ queryKey: ["catalogo-articolo", codice], queryFn: () => dettaglioArticoloGamma({ data: { codice } }) });
  if (!a) return <p className="py-6 text-muted-foreground">Articolo non trovato.</p>;
  return <header className="mt-4 border-b pb-4">
    <p className="break-words font-mono text-sm text-muted-foreground">{a.codice}</p>
    <h1 className="mt-2 break-words text-2xl font-bold text-navy">{a.descrizione}</h1>
    <p className="mt-2 break-words text-sm text-muted-foreground">{a.marche?.descrizione ?? "—"}</p>
  </header>;
}