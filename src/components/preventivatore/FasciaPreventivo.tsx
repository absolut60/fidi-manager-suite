import { ExternalLink } from "lucide-react";
import { formatNumeroIt } from "@/lib/numero-it";
import { IndicatoreClientePreventivo } from "./IndicatoreClientePreventivo";

export interface RiepilogoPreventivo {
  cliente: string; cantiere: string; listino: string; categoria: string; pagamento: string; validita: string;
  imponibile: number; marginePerc: number; margineEuro: number;
}
export function FasciaPreventivo({ dati, titolo, onCliente, clienteId }: { dati: RiepilogoPreventivo; titolo?: string | null; onCliente: () => void; clienteId?: string | null }) {
  const fmt = (n: number) => formatNumeroIt(n, { minDecimals: 2, maxDecimals: 2 });
  const etichetta = "block text-[10.5px] font-semibold uppercase tracking-wide text-foreground/75";
  const voce = (label: string, value: string) => (
    <div key={label} className="min-w-0 pv-orizzontale:hidden">
      <span className={etichetta}>{label}</span>
      <span className="block break-words text-sm font-medium">{value}</span>
    </div>
  );
  return <section aria-label="Riepilogo preventivo" className="flex flex-col gap-3 rounded-[12px] border border-pv-azzurro-medio-bordo bg-pv-azzurro-medio p-3 text-foreground lg:flex-row lg:items-center lg:gap-6 lg:p-4 pv-orizzontale:flex-row pv-orizzontale:items-center pv-orizzontale:gap-3 pv-orizzontale:p-2">
    <div className="min-w-0 flex-1 space-y-2 pv-orizzontale:space-y-0">
      <h2 className="break-words text-[18px] font-bold leading-tight pv-orizzontale:truncate pv-orizzontale:text-sm">{titolo || "Senza titolo"}</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto] pv-orizzontale:grid-cols-1!">
        <div className="min-w-0">
          <span className={`${etichetta} pv-orizzontale:hidden`}>Cliente</span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><button type="button" onClick={onCliente} className="inline-flex max-w-full items-start gap-1 text-left pv-orizzontale:items-center text-sm font-semibold text-pv-blu underline-offset-2 hover:underline">
            <span className="min-w-0 break-words pv-orizzontale:truncate">{dati.cliente}</span><ExternalLink className="mt-0.5 size-3 shrink-0" />
          </button><IndicatoreClientePreventivo clienteId={clienteId}/></div>
        </div>
        {voce("Cantiere", dati.cantiere)}
        {voce("Validità", dati.validita)}
      </div>
    </div>
    <div className="grid shrink-0 grid-cols-2 gap-2 lg:flex pv-orizzontale:flex">
      <div className="min-w-0 rounded-lg border border-pv-verde/30 bg-pv-verde-tenue px-3 py-2 text-right text-pv-verde pv-orizzontale:py-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide pv-orizzontale:text-[9px]">Margine</span>
        <span className="block whitespace-nowrap text-sm font-bold tabular-nums">{formatNumeroIt(dati.marginePerc,{minDecimals:1,maxDecimals:1})}% · € {fmt(dati.margineEuro)}</span>
      </div>
      <div className="min-w-0 rounded-lg bg-primary px-3 py-2 text-right text-primary-foreground pv-orizzontale:py-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide opacity-80 pv-orizzontale:text-[9px]">Totale imponibile</span>
        <span className="block whitespace-nowrap text-lg font-bold tabular-nums sm:text-2xl pv-orizzontale:text-base!">€ {fmt(dati.imponibile)}</span>
      </div>
    </div>
  </section>;
}
