// FM62 F7: card "Convenzione" nel Riepilogo. Scrive solo via imposta_convenzionato_fornitori (chi gestisce i fornitori).
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Handshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { impostaConvenzionatoFornitori, type DettaglioFornitore } from "@/lib/fornitori.functions";
import { messaggioConvenzione } from "@/lib/scheda-fornitore";
import { BadgeConvenzionato } from "./controlli-fornitori";

const dataOra = (v: string | null | undefined) => v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : null;

export function ConvenzioneCard({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const qc = useQueryClient();
  const imposta = useServerFn(impostaConvenzionatoFornitori);
  const m = useMutation({
    mutationFn: (valore: boolean) => imposta({ data: { ids: [f.id], valore } }),
    onSuccess: async (r, valore) => { toast.success(messaggioConvenzione(valore, r)); await qc.invalidateQueries({ queryKey: ["fornitore", f.id] }); void qc.invalidateQueries({ queryKey: ["fornitori"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const quando = dataOra(f.convenzionato_il);
  return <Card className="min-w-0 space-y-2 rounded-xl border-[0.5px] p-3.5">
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground"><Handshake className="size-3.5" aria-hidden />Convenzione</p>
    {f.puo_modificare_note
      ? <label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={f.convenzionato} disabled={m.isPending} onCheckedChange={v => m.mutate(v)} aria-label="Convenzionato" /><span className="font-semibold">{f.convenzionato ? "Convenzionato" : "Non convenzionato"}</span></label>
      : <div className="min-h-10 text-sm">{f.convenzionato ? <BadgeConvenzionato /> : <span className="font-semibold text-muted-foreground">Non convenzionato</span>}</div>}
    {quando && <p className="text-xs text-muted-foreground">Modificato {f.convenzionato_da_nome ? `da ${f.convenzionato_da_nome} ` : ""}il {quando}{f.convenzionato_fonte === "gamma" ? " (da Gamma)" : ""}</p>}
    {f.convenzionato && f.tipo_conflitto_convenzione && <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />In Gamma risulta fornitore di servizi: verificare</p>}
  </Card>;
}
