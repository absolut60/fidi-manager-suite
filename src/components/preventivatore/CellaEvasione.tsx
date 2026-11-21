import { evasioneRigaInUnita } from '@/lib/evasione';
import { cn } from '@/lib/utils';

export function CellaEvasione({ riga }: { riga: Parameters<typeof evasioneRigaInUnita>[0] }) {
  const ev = evasioneRigaInUnita(riga);
  if (!ev.valorizzata) return null;
  const tono = ev.stato === 'evasa' ? 'bg-pv-verde-tenue text-pv-verde border-pv-verde/30'
    : ev.stato === 'parziale' ? 'bg-pv-arancio-tenue text-pv-arancio border-pv-arancio/30'
    : 'bg-muted text-muted-foreground border-border';
  const fmt = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return <div className="flex flex-col items-end gap-0.5 font-mono text-xs">
    <span className={cn('rounded border px-1.5 py-0.5 font-semibold', tono)}>{ev.stato === 'evasa' ? 'Evasa' : ev.stato === 'parziale' ? 'Parziale' : 'Aperta'}</span>
    {ev.stato === 'parziale' && <span className="whitespace-nowrap text-muted-foreground">aperto {fmt(ev.residuo)} su {fmt(ev.quantita)}</span>}
  </div>;
}