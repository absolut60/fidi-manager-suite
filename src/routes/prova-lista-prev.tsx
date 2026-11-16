import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } } });
const riga = (i: number, nome: string, creato: string) => ({
  id: `id-${i}`, numero: `PRV-${160 + i}/26`, titolo: i === 1 ? "Ristrutturazione completa bagni e cucina appartamento via Roma" : "Fornitura piastrelle",
  cliente_id: `c${i}`, cliente: { id: `c${i}`, ragione_sociale: nome, codice_gestionale: "123" }, lead: null, lead_id: null,
  cantiere: i === 1 ? { id: "k", nome: "Cantiere Lissone Centro" } : null, creato_da: `u${i}`, creato_da_nome: creato,
  data: "2026-11-10", validita: "2026-12-10", tipo_doc: "preventivo", stato: i === 2 ? "inviato" : "bozza", totale: 123456.78 * i,
  linea: "showroom", alternativa_di: null, assegnato_a: null, blocchi: [],
});
const filters = { search: "", cliente_id: [], stato: [], tipo_doc: [], creato_da: [], linea: [], tipo: "preventivo", per_me: null };
qc.setQueryData(["preventivi", "elenco", filters], { principali: [
  riga(1, "CARICO MONGIUSTI COSTRUZIONI EDILI E RISTRUTTURAZIONI GENERALI S.R.L.", "Carico Mongiusti"),
  riga(2, "PIPPO SRL", "Ombretta Giannubilo"), riga(3, "EDILIZIA BRIANZA SOCIETA' COOPERATIVA", "Mario Rossi"),
], alternative: [] });

export const Route = createFileRoute("/prova-lista-prev")({
  component: () => (
    <QueryClientProvider client={qc}>
      <div className="flex"><div className="hidden w-64 shrink-0 bg-sidebar md:block" /><main className="min-w-0 flex-1"><PreventiviListView tipo="preventivo" /></main></div>
    </QueryClientProvider>
  ),
});
