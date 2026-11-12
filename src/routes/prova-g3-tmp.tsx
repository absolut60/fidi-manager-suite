import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InviaEmailFornitoreDialog } from "@/components/fornitori/InviaEmailFornitoreDialog";
export const Route = createFileRoute("/prova-g3-tmp")({ component: P });
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
qc.setQueryData(["allegati", "fornitore", "00000000-0000-4000-8000-000000000001", "per-email"], [
  { id: "a1", nome_file: "Listino_2027_EDILFORNITURE.pdf", dimensione_bytes: 1250000, created_at: "2026-11-02T10:00:00Z" },
  { id: "a2", nome_file: "Condizioni_generali_fornitura.pdf", dimensione_bytes: 480000, created_at: "2026-10-15T10:00:00Z" },
]);
function P() {
  return <QueryClientProvider client={qc}><InviaEmailFornitoreDialog open onOpenChange={() => {}} onInviata={() => {}}
    fornitore={{ id: "00000000-0000-4000-8000-000000000001", ragione_sociale: "EDILFORNITURE ESEMPIO SRL", email: "ordini@esempio.it", pec: "edilforniture@pec.esempio.it" }} /></QueryClientProvider>;
}
