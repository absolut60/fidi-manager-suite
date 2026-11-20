import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SpecificaKitLinea } from '@/lib/linee-preventivo';

export function SpecificheKitFields({ campi, valori, onChange, onCommit }: {
  campi: readonly SpecificaKitLinea[];
  valori: Record<string, string>;
  onChange: (codice: string, valore: string) => void;
  onCommit?: () => void;
}) {
  return <>{campi.map(c => <div key={c.codice} className="grid min-w-0 gap-1.5">
    <Label htmlFor={`kit-specifica-${c.codice}`}>{c.etichetta}</Label>
    <Input id={`kit-specifica-${c.codice}`} className="min-h-11" inputMode={c.tipo === 'numero' ? 'decimal' : 'text'}
      value={valori[c.codice] ?? ''} onChange={e => onChange(c.codice,e.target.value)} onBlur={onCommit} />
  </div>)}</>;
}