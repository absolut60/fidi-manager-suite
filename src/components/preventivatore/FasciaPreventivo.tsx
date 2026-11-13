import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { formatNumeroIt } from "@/lib/numero-it";

export interface RiepilogoPreventivo {
  cliente: string; cantiere: string; listino: string; categoria: string; pagamento: string; validita: string;
  imponibile: number; marginePerc: number; margineEuro: number;
}
export function FasciaPreventivo({ dati, onCliente }: { dati: RiepilogoPreventivo; onCliente: () => void }) {
  const fmt = (n: number) => formatNumeroIt(n, { minDecimals: 2, maxDecimals: 2 });
  return <section aria-label="Riepilogo preventivo" className="bg-primary text-primary-foreground px-3 py-3 flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-3">
    <div className="min-w-0 basis-full lg:basis-auto lg:flex-1">
      <span className="text-xs opacity-75">Cliente</span>
      <Button variant="link" className="h-auto min-h-10 p-0 text-primary-foreground whitespace-normal text-left justify-start break-words" onClick={onCliente}>{dati.cliente}<ExternalLink className="size-3 shrink-0 ml-1" /></Button>
    </div>
    {([['Cantiere',dati.cantiere],['Listino',dati.listino],['Categoria',dati.categoria],['Pagamento',dati.pagamento],['Validità',dati.validita]] as const).map(([label,value]) => <div key={label} className="min-w-0 basis-[calc(50%-1rem)] lg:basis-auto lg:flex-1"><div className="text-xs opacity-75">{label}</div><div className="text-xs break-words font-medium">{value}</div></div>)}
    <div className="ml-auto shrink-0"><div className="text-xs opacity-75">Margine</div><div className="text-sm font-semibold">{formatNumeroIt(dati.marginePerc,{minDecimals:1,maxDecimals:1})}% · € {fmt(dati.margineEuro)}</div></div>
    <div className="shrink-0"><div className="text-xs opacity-75">Totale imponibile</div><div className="text-2xl font-bold tabular-nums">€ {fmt(dati.imponibile)}</div></div>
  </section>;
}