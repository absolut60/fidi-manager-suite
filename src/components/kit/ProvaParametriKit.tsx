import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { KitParametro } from '@/lib/kit-regole-ui';
import { formatNumeroIt } from '@/lib/numero-it';

export function ProvaParametriKit({ parametri, valori, onChange }: {
  parametri: readonly KitParametro[]; valori: Readonly<Record<string, string>>;
  onChange: (codice: string, valore: string) => void;
}) {
  if (!parametri.length) return null;
  return <div className="min-w-0 space-y-2 border-b pb-3">
    <div className="flex flex-wrap items-baseline gap-2"><h3 className="text-sm font-semibold">Prova i parametri</h3><span className="text-xs text-muted-foreground">Questi valori non si salvano.</span></div>
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{parametri.map(p => {
      const id = `prova-${p.codice}`; const valore = valori[p.codice] ?? String(p.valore_default).replace('.', ',');
      return <div key={p.id} className="grid min-w-0 gap-1"><Label htmlFor={id} className="break-words text-xs">{p.etichetta}{p.um ? ` (${p.um})` : ''}</Label>
        {p.tipo === 'scelta' ? <Select value={valore.replace(',', '.')} onValueChange={v => onChange(p.codice, v.replace('.', ','))}><SelectTrigger id={id} className="min-h-11"><SelectValue/></SelectTrigger><SelectContent>{p.valori_ammessi?.map(v => <SelectItem key={v} value={String(v)} className="min-h-10">{formatNumeroIt(v, { maxDecimals: 6 })}</SelectItem>)}</SelectContent></Select>
          : <Input id={id} className="min-h-11" inputMode="decimal" value={valore} onChange={e => onChange(p.codice, e.target.value)}/>}
      </div>;
    })}</div>
  </div>;
}