// FM62 G5: pannello di avanzamento dell'invio a più fornitori (letto da invii_fornitori).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { statoInvioFornitori } from "@/lib/invio-multiplo-fornitori.functions";

export function AvanzamentoInvioFornitori({ invioId, onChiudi }: { invioId: string; onChiudi: () => void }) {
  const leggi = useServerFn(statoInvioFornitori);
  const q = useQuery({
    queryKey: ["invio-fornitori", invioId], queryFn: () => leggi({ data: { invioId } }),
    refetchInterval: r => (r.state.data && r.state.data.stato !== "in_corso" ? false : 4000),
  });
  const d = q.data;
  const fatti = (d?.inviati ?? 0) + (d?.errori ?? 0);
  const perc = d?.totale ? Math.round((fatti / d.totale) * 100) : 0;
  const finito = d && d.stato !== "in_corso";
  const num = (x: number) => x.toLocaleString("it-IT");
  return <section role="status" aria-live="polite" className="min-w-0 space-y-2 rounded-lg border border-border bg-card p-3 sm:p-4">
    <div className="flex items-start justify-between gap-2">
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        {finito ? <CheckCircle2 className={`size-4 shrink-0 ${d.errori ? "text-warning" : "text-success"}`} /> : <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        <span className="min-w-0 break-words">{finito ? (d.errori ? "Invio concluso con errori" : "Invio concluso") : "Invio ai fornitori in corso"}{d ? ` — "${d.oggetto}"` : ""}</span>
      </p>
      {finito && <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Chiudi avanzamento" onClick={onChiudi}><X className="size-4" /></Button>}
    </div>
    {q.error ? <p className="text-sm text-destructive">{q.error.message}</p> : <>
      <Progress value={perc} aria-label="Avanzamento invio" />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span>Inviate <strong className="text-foreground">{num(d?.inviati ?? 0)}</strong> di {num(d?.totale ?? 0)}</span>
        <span>Errori <strong className={d?.errori ? "text-destructive" : "text-foreground"}>{num(d?.errori ?? 0)}</strong></span>
        <span>Saltati (senza email) <strong className="text-foreground">{num(d?.saltati ?? 0)}</strong></span>
      </p>
      {!finito && <p className="text-xs text-muted-foreground">Puoi chiudere la pagina: l'invio continua e a fine lavoro ricevi una notifica.</p>}
    </>}
  </section>;
}
