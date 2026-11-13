import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";
// TEMPORANEA: prova grafica con dati finti, da rimuovere.
const mk = (id: string, numero: string, alt: string | null, created: string, extra: Record<string, unknown> = {}) => ({
  id, numero, alternativa_di: alt, created_at: created, data: "2026-11-10", validita: "2026-11-17",
  titolo: "Ristrutturazione bagno e cucina con controparete in cartongesso", tipo_doc: "PREVENTIVO", stato: "bozza", totale: 170.01,
  cliente_id: "c1", cliente: { id: "c1", ragione_sociale: "A.N. COSTRUZIONI SRL DI MARIO ROSSI E FIGLI", codice_gestionale: "13380" },
  cantiere: { id: "k", nome: "Via Roma 12, Sedriano" }, creato_da: "u1", creato_da_nome: "Andrea Giani",
  blocchi: [{ righe: [{ tipo_riga: "articolo_singolo", quantita: 10, qta_ordinata: 0 }] }], ...extra,
});
const dati = {
  principali: [
    mk("p1", "PRV-161/26", null, "2026-11-10T10:00:00Z"),
    mk("p2", "PRV-162/26", null, "2026-11-11T10:00:00Z", { titolo: null, stato: "confermato", tipo_doc: "LISTA_MAT_FORNITORE", totale: 12543.5, creato_da: null, creato_da_nome: null, blocchi: [{ righe: [{ tipo_riga: "articolo_singolo", quantita: 10, qta_ordinata: 5 }] }] }),
  ],
  alternative: [
    mk("a2", "PRV-164/26", "p1", "2026-11-12T10:00:00Z", { stato: "inviato", totale: 210 }),
    mk("a1", "PRV-163/26", "p1", "2026-11-11T10:00:00Z", { totale: 190 }),
  ],
};
function Pagina() {
  const qc = useQueryClient();
  const key = ["preventivi", "elenco", { search: "", cliente_id: [], stato: [], tipo_doc: [], creato_da: [], tipo: "preventivo" }];
  qc.setQueryDefaults(["preventivi", "elenco"], { staleTime: Infinity, retry: false });
  if (!qc.getQueryData(key)) qc.setQueryData(key, dati);
  return <PreventiviListView tipo="preventivo" />;
}
export const Route = createFileRoute("/prova-elenco")({ component: Pagina });
