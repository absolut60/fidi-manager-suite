import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import { BadgeCondizioniRiferimento } from "@/components/preventivatore/BadgeCondizioniRiferimento";
import { BadgePrezziDedicati } from "@/components/badge-prezzi-dedicati";
import { fetchPreventivo, updatePreventivo } from "@/lib/preventivi-api";
import { opzioniCataloghiRiferimento, type RiferimentoPreventivo } from "@/lib/condizioni-riferimento";
const id = "11111111-1111-4111-8111-111111111111";
export const Route = createFileRoute("/fm71-verifica-temporanea")({ component: Prova });
function Prova() {
  const qc = useQueryClient();
  const { data: prev } = useQuery({ queryKey: ["preventivo", id], queryFn: () => fetchPreventivo(id) });
  const cataloghi = useQuery(opzioniCataloghiRiferimento);
  const save = useMutation({ mutationKey: ["salva-preventivo", id], mutationFn: (p: RiferimentoPreventivo) => updatePreventivo(id, p), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["preventivo", id] }); }, onError: () => toast.error("Salvataggio negato") });
  if (!prev) return null;
  const badge = <BadgeCondizioniRiferimento riferimento={prev} cataloghi={cataloghi.data}/>;
  return <main className="p-3"><TestataPreventivo prev={prev} cliente={null} modificabile statoEditabile agenti={[]} principali={[]} haAlternative={false} listino="10 — Cliente" categoria="IMPRESE Categoria C" sede="Empoli" onSave={() => {}} onCliente={() => {}} onChangeCliente={() => {}} onCantiere={() => {}} cataloghiRiferimento={cataloghi.data} erroreCataloghi={cataloghi.error?.message} caricamentoCataloghi={cataloghi.isLoading} badgeRiferimento={badge} onRiferimento={async p => { await save.mutateAsync(p); if (prev.blocchi.some(b => b.righe.length)) toast.info("Le righe esistenti non cambiano: usa Aggiorna listini per vedere le differenze"); }}/><section aria-label="Corpo" className="flex flex-wrap items-center gap-2"><BadgePrezziDedicati conteggio={2}/>{badge}</section></main>;
}