// FM62 F7: card "Convenzione" nel Riepilogo. Scrive solo via imposta_stato_convenzione_fornitori (solo amministratore).
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Handshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { impostaStatoConvenzioneFornitori, type DettaglioFornitore } from "@/lib/fornitori.functions";
import { ETICHETTE_CONVENZIONE, STATI_CONVENZIONE, type StatoConvenzione } from "@/lib/fornitori";
import { messaggioConvenzione } from "@/lib/scheda-fornitore";
import { BandierinaConvenzionato } from "./BandierinaConvenzionato";

const dataOra = (v: string | null | undefined) => v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : null;

export function ConvenzioneCard({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const qc = useQueryClient();
  const imposta = useServerFn(impostaStatoConvenzioneFornitori);
  const m = useMutation({
    mutationFn: (stato: StatoConvenzione) => imposta({ data: { ids: [f.id], stato } }),
    onSuccess: async (r, stato) => { toast.success(messaggioConvenzione(stato, r)); await qc.invalidateQueries({ queryKey: ["fornitore", f.id] }); void qc.invalidateQueries({ queryKey: ["fornitori"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const quando = dataOra(f.stato_convenzione_il);
  const conv = f.stato_convenzione === "convenzionato";
  return <Card className="min-w-0 space-y-2 rounded-xl border-[0.5px] p-3.5">
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground"><Handshake className="size-3.5" aria-hidden />Convenzione</p>
    {f.puo_cambiare_convenzione
      ? <Select value={f.stato_convenzione} disabled={m.isPending} onValueChange={v => m.mutate(v as StatoConvenzione)}>
          <SelectTrigger aria-label="Stato convenzione" className="min-h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{STATI_CONVENZIONE.map(s => <SelectItem key={s} value={s}>{ETICHETTE_CONVENZIONE[s]}</SelectItem>)}</SelectContent>
        </Select>
      : <p className="flex min-h-10 items-center text-sm font-semibold">{conv && <BandierinaConvenzionato className="-ml-1" />}{ETICHETTE_CONVENZIONE[f.stato_convenzione]}</p>}
    {quando && <p className="text-xs text-muted-foreground">Modificato {f.stato_convenzione_da_nome ? `da ${f.stato_convenzione_da_nome} ` : ""}il {quando}{f.stato_convenzione_fonte === "gamma" ? " (da Gamma)" : ""}</p>}
    {conv && f.tipo_conflitto_convenzione && <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />In Gamma risulta fornitore di servizi: verificare</p>}
  </Card>;
}
