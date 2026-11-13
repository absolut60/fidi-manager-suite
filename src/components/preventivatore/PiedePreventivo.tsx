import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumeroIt, parseNumeroIt } from "@/lib/numero-it";
import type { RiepilogoPreventivo } from "./FasciaPreventivo";
import { RiquadroScheda } from "./RiquadroScheda";
import { Calculator, Percent } from "lucide-react";

export function PiedePreventivo({ dati, iva, totale, ivaPerc, sconto, editMode, inCorso, onSconto, onTestata }: {
  dati: RiepilogoPreventivo; iva: number; totale: number; ivaPerc: number; sconto: number; editMode: boolean; inCorso: boolean; onSconto: (n:number)=>void; onTestata:()=>void;
}) {
  const fmt=(n:number)=>formatNumeroIt(n,{minDecimals:2,maxDecimals:2});
  return <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-4">
    <RiquadroScheda titolo="Sconti e pagamento" icona={Percent} tono="arancio"><div className="space-y-5 min-w-0">
      <div className="space-y-2"><Label htmlFor="sconto-piede">Sconto a piede %</Label><Input id="sconto-piede" className="w-32 bg-card text-right" inputMode="decimal" disabled={!editMode||inCorso} key={sconto} defaultValue={formatNumeroIt(sconto)} onBlur={(e)=>{ const n=Math.max(0,parseNumeroIt(e.target.value)||0); if(n!==sconto)onSconto(n); }}/><p className="text-xs text-muted-foreground">Si aggiunge agli sconti Gamma di ogni riga</p></div>
      <div><Label>Condizione di pagamento</Label><p className="text-sm break-words mt-1">{dati.pagamento}</p><Button variant="link" className="px-0" onClick={onTestata}>cambia in Testata</Button></div>
      <p className="text-sm text-muted-foreground">Validità: {dati.validita}. I prezzi sono espressi in Euro, IVA esclusa salvo diversa indicazione.</p>
    </div></RiquadroScheda>
    <RiquadroScheda titolo="Totali" icona={Calculator} tono="azzurro"><div className="min-w-0">
      {([['Margine',`${formatNumeroIt(dati.marginePerc,{minDecimals:1,maxDecimals:1})}% · € ${fmt(dati.margineEuro)}`],['Imponibile',`€ ${fmt(dati.imponibile)}`],[`IVA ${formatNumeroIt(ivaPerc)}%`,`€ ${fmt(iva)}`]]).map(([l,v])=><div key={l} className="flex justify-between gap-3 border-b border-pv-azzurro-bordo py-3 text-sm"><span className="text-muted-foreground">{l}</span><strong className="tabular-nums">{v}</strong></div>)}
      <div className="mt-3 rounded-lg bg-primary text-primary-foreground p-4 flex flex-wrap justify-between gap-2 items-center"><span className="font-semibold text-sm">Totale con IVA</span><strong className="text-2xl tabular-nums">€ {fmt(totale)}</strong></div>
    </div></RiquadroScheda>
  </section>;
}