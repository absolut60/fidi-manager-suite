import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select';
import { CAMPI_REGOLA_KIT, descrizioneOperandoKit, fraseRegolaKit, sceltaOperandoKit, type CampoRegolaKit, type KitParametro, type RigaMenuKit } from '@/lib/kit-regole-ui';
import { normalizzaOperandoKit, type CampiRegolaKit } from '@/lib/kit-regole';

export function RegolaComponenteKit({ ordine, regola, completa, parametri, righe, modificabile, onChange, onSave }: {
  ordine: number; regola: Partial<CampiRegolaKit>; completa: boolean; parametri: readonly KitParametro[];
  righe: readonly RigaMenuKit[]; modificabile: boolean;
  onChange: (campo: CampoRegolaKit, testo: string) => void;
  onSave: (campo: CampoRegolaKit, testo: string | null) => Promise<void>;
}) {
  const [errore, setErrore] = useState('');
  const baseId = useId();
  async function salva(campo: CampoRegolaKit, testo: string | null) {
    try { setErrore(''); await onSave(campo, normalizzaOperandoKit(testo)); }
    catch (e) { setErrore(e instanceof Error ? e.message : 'Regola non salvata.'); }
  }
  return <div className="min-w-0 space-y-2">
    <div className={`grid min-w-0 gap-2 ${completa ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6' : 'grid-cols-1'}`}>
      {(completa ? CAMPI_REGOLA_KIT : CAMPI_REGOLA_KIT.slice(0, 1)).map(campo => {
        const valore = regola[campo.codice] ?? '';
        const riferimento = valore.startsWith('PARAM:') || valore.startsWith('RIGA:');
        const etichetta = completa ? campo.etichetta : 'Quantità per kit';
        const id = `${baseId}-${ordine}-${campo.codice}`;
        return <div key={campo.codice} className="grid min-w-0 gap-1">
          <Label htmlFor={id} className="text-xs">{etichetta}</Label>
          {modificabile ? <div className="flex min-w-0 items-center gap-1">
            {riferimento ? <div id={id} role="textbox" aria-readonly="true" aria-label={`${etichetta} riga ${ordine}`} data-operando={valore} className="flex min-h-11 min-w-0 flex-1 items-center rounded-md border border-input px-2 py-2 text-xs"><span className="break-words">{descrizioneOperandoKit(valore, parametri)}</span></div> : <Input id={id} aria-label={`${etichetta} riga ${ordine}`} className="min-h-11 min-w-0 flex-1 px-2 text-xs" inputMode="decimal" value={descrizioneOperandoKit(valore, parametri)}
              onChange={e => { setErrore(''); onChange(campo.codice, e.target.value); }}
              onBlur={() => { void salva(campo.codice, valore); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>}
            <Select value={riferimento ? valore : '__numero__'} onValueChange={v => {
              const testo = v === '__numero__' ? '' : v.startsWith('PARAM:') ? sceltaOperandoKit('parametro', v.slice(6)) : sceltaOperandoKit('riga', v.slice(5));
              onChange(campo.codice, testo); void salva(campo.codice, testo);
            }}><SelectTrigger className="h-11 w-10 shrink-0 justify-center px-1" aria-label={`Scegli ${etichetta} riga ${ordine}`} title={`Scegli ${etichetta}`}/><SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem className="min-h-10 text-xs" value="__numero__">Numero / vuoto</SelectItem>
              {completa && parametri.length > 0 && <SelectGroup><SelectLabel>Parametro…</SelectLabel>{parametri.map(p => <SelectItem className="min-h-10 break-words text-xs" key={p.id} value={sceltaOperandoKit('parametro', p.codice)}>{p.etichetta} · {p.codice}</SelectItem>)}</SelectGroup>}
              <SelectGroup><SelectLabel>Quantità della riga…</SelectLabel>{righe.filter(r => r.ordine !== ordine).map(r => <SelectItem className="min-h-10 break-words text-xs" key={r.ordine} value={sceltaOperandoKit('riga', r.ordine)}>Riga {r.ordine} · {r.descrizione}</SelectItem>)}</SelectGroup>
            </SelectContent></Select>
          </div> : <p className="min-h-8 break-words text-xs">{descrizioneOperandoKit(valore, parametri) || '—'}</p>}
        </div>;
      })}
    </div>
    <p className="break-words text-xs text-muted-foreground">{fraseRegolaKit(regola, parametri)}</p>
    {errore && <p role="alert" className="break-words text-xs text-destructive">{errore}</p>}
  </div>;
}