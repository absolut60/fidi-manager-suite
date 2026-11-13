import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { formatNumeroIt } from "@/lib/numero-it";

export interface RiepilogoPreventivo {
  cliente: string; cantiere: string; listino: string; categoria: string; pagamento: string; validita: string;
  imponibile: number; marginePerc: number; margineEuro: number;
}
export function FasciaPreventivo({ dati, onCliente }: { dati: RiepilogoPreventivo; onCliente: () => void }) {
  const fmt = (n: number) => formatNumeroIt(n, { minDecimals: 2, maxDecimals: 2 });
  const etichetta = "block text-[10.5px] font-medium uppercase tracking-wide opacity-70";
  const voce = (label: string, value: string, max?: string) => (
    <div key={label} className={`min-w-0 lg:shrink-0 ${max ?? ""}`}>
      <span className={etichetta}>{label}</span>
      <span title={value} className="block break-words text-xs font-medium lg:overflow-hidden lg:text-ellipsis lg:whitespace-nowrap">{value}</span>
    </div>
  );
  return <section aria-label="Riepilogo preventivo" className="grid grid-cols-2 gap-x-4 gap-y-3 bg-primary px-3 py-3 text-primary-foreground lg:flex lg:flex-wrap lg:items-end lg:gap-x-7">
    <div className="col-span-2 min-w-0 lg:max-w-[18rem] lg:shrink-0">
      <span className={etichetta}>Cliente</span>
      <Button variant="link" title={dati.cliente} className="flex h-auto max-w-full justify-start p-0 text-left text-xs font-medium text-primary-foreground" onClick={onCliente}>
        <span className="min-w-0 break-words lg:overflow-hidden lg:text-ellipsis lg:whitespace-nowrap">{dati.cliente}</span><ExternalLink className="ml-1 size-3 shrink-0" />
      </Button>
    </div>
    {voce("Cantiere", dati.cantiere, "lg:max-w-[14rem]")}
    {voce("Listino", dati.listino, "lg:max-w-[10rem]")}
    {voce("Categoria", dati.categoria, "lg:max-w-[14rem]")}
    {voce("Pagamento", dati.pagamento, "lg:max-w-[16rem]")}
    {voce("Validità", dati.validita, "lg:shrink-0")}
    <div className="col-span-2 grid grid-cols-2 gap-x-4 lg:ml-auto lg:flex lg:shrink-0 lg:items-end lg:gap-x-7"><div className="min-w-0"><span className={etichetta}>Margine</span><span className="block whitespace-nowrap text-sm font-semibold">{formatNumeroIt(dati.marginePerc,{minDecimals:1,maxDecimals:1})}% · € {fmt(dati.margineEuro)}</span></div>
    <div className="min-w-0"><span className={etichetta}>Totale imponibile</span><span className="block whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl">€ {fmt(dati.imponibile)}</span></div></div>
  </section>;
}
