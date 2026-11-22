import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { avvisoCodiceSdi, normalizzaCodiceSdi } from '@/lib/codice-sdi';

export function CampoCodiceSdi({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const avviso = avvisoCodiceSdi(value);
  return <div className="grid min-w-0 gap-1.5">
    <Label htmlFor={id} className="text-xs leading-normal">Codice SDI (fatturazione elettronica)</Label>
    <Input id={id} value={value} maxLength={7} autoCapitalize="characters" autoComplete="off" spellCheck={false}
      className="min-h-11 min-w-0" aria-describedby={`${id}-aiuto${avviso ? ` ${id}-avviso` : ''}`}
      onChange={e => onChange(normalizzaCodiceSdi(e.target.value))}
      onPaste={e => { e.preventDefault(); onChange(normalizzaCodiceSdi(e.clipboardData.getData('text'))); }} />
    {avviso && <p id={`${id}-avviso`} className="text-xs text-pv-arancio">Il codice SDI deve avere 7 caratteri. Puoi comunque salvare.</p>}
    <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">Per i privati lascialo vuoto: in Gamma verrà usato 0000000</p>
  </div>;
}