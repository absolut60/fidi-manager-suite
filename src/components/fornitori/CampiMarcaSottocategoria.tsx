// FM62: campi Marca e Sottocategoria del Riepilogo fornitore. Modificabili solo dall'amministratore
// (puo_cambiare_convenzione = has_role amministratore); il controllo vero resta nelle RPC.
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { impostaMarcaFornitori, impostaSottocategoriaFornitori, type DettaglioFornitore } from "@/lib/fornitori.functions";
import { SceltaMarca, SceltaSottocategoria } from "./MarcaSottocategoriaFornitore";

function useAggiorna(id: string) {
  const qc = useQueryClient();
  return async () => { toast.success("Salvato"); await qc.invalidateQueries({ queryKey: ["fornitore", id] }); void qc.invalidateQueries({ queryKey: ["fornitori"] }); };
}
export function MarcaFornitoreCampo({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const imposta = useServerFn(impostaMarcaFornitori);
  const fatto = useAggiorna(f.id);
  const m = useMutation({ mutationFn: (marca: string | null) => imposta({ data: { ids: [f.id], marca } }), onSuccess: fatto, onError: (e: Error) => toast.error(e.message) });
  const nota = f.marca_fonte === "manuale" ? "impostata a mano" : f.marca_fonte === "automatica" ? "calcolata dagli articoli" : null;
  return <div className="space-y-1">
    {f.puo_cambiare_convenzione
      ? <SceltaMarca valore={f.marca_codice} onChange={v => m.mutate(v)} disabled={m.isPending} />
      : <span className="font-semibold" title={f.marca_codice ? `Codice marca ${f.marca_codice}` : undefined}>{f.marca_codice ? f.marca_descrizione || f.marca_codice : "Nessuna marca"}</span>}
    {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
  </div>;
}
export function SottocategoriaFornitoreCampo({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const imposta = useServerFn(impostaSottocategoriaFornitori);
  const fatto = useAggiorna(f.id);
  const m = useMutation({ mutationFn: (codice: string | null) => imposta({ data: { ids: [f.id], codice } }), onSuccess: fatto, onError: (e: Error) => toast.error(e.message) });
  if (f.sottocategoria_fonte === "gamma") return <div className="space-y-1"><span className="font-semibold">{f.sottocategoria_descrizione}</span><p className="text-xs text-muted-foreground">da Gamma</p></div>;
  if (!f.puo_cambiare_convenzione) return <span className="font-semibold">{f.sottocategoria_descrizione || "—"}</span>;
  return <SceltaSottocategoria valore={f.sottocategoria_codice} onChange={v => m.mutate(v)} disabled={m.isPending} />;
}
