import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAMPI_SEMPLICI_KIT, numeroCampoKit, testoNumeroKit, type CampoSempliceKit } from '@/lib/kit-semplice-ui';
import { formatNumeroIt } from '@/lib/numero-it';
import type { CampiSempliciKit } from '@/lib/kit-regole';
import type { RigaMenuKit } from '@/lib/kit-semplice-ui';
import { AiutoCalcolaDallaRiga } from './AiutoCalcolaDallaRiga';

export function NumeroKit({ campo, etichetta, valore, disabled, onChange, onSave, compatto = false }: {
  campo: CampoSempliceKit; etichetta: string; valore: number | null | undefined;
  disabled: boolean; onChange: (v: number | null) => void; onSave?: (v: number | null) => Promise<void>; compatto?: boolean;
}) {
  const [testo, setTesto] = useState(testoNumeroKit(valore, false));
  const [editing, setEditing] = useState(false);
  const [errore, setErrore] = useState('');
  const [busy, setBusy] = useState(false);
  const iniziale = useRef(valore ?? null);
  useEffect(() => { if (!editing) setTesto(testoNumeroKit(valore, false)); }, [valore, editing]);
  const cambia = (t: string) => {
    setEditing(true); setTesto(t);
    try { const n = numeroCampoKit(campo, t); setErrore(''); onChange(n); }
    catch (e) { setErrore(e instanceof Error ? e.message : 'Numero non valido.'); }
  };
  const salva = async () => {
    if (!editing) return;
    try {
      const n = numeroCampoKit(campo, testo);
      setBusy(true); if (onSave && n !== iniziale.current) await onSave(n);
      setErrore(''); setEditing(false);
    } catch (e) { setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); }
    finally { setBusy(false); }
  };
  if (disabled && compatto) return <p className="min-h-10 break-all px-1 py-2 text-right font-mono text-xs" title={testoNumeroKit(valore, true)}>{valore == null ? '—' : testoNumeroKit(valore, false)}</p>;
  return <div className="min-w-0"><Input aria-label={etichetta} aria-invalid={!!errore} title={testo} inputMode="decimal" value={testo}
    disabled={disabled || busy} placeholder="—" className={compatto ? 'h-10 min-w-0 rounded-sm px-1 text-right font-mono text-xs' : 'min-h-11 min-w-0 text-right font-mono text-base sm:text-sm'}
    onFocus={() => { iniziale.current = valore ?? null; setTesto(testoNumeroKit(valore, true)); setEditing(true); }}
    onChange={e => cambia(e.target.value)} onBlur={() => void salva()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTesto(testoNumeroKit(valore, false)); setEditing(false); setErrore(''); onChange(valore ?? null); } }}/>
    {errore && <p role="alert" className="mt-1 break-words text-xs text-destructive">{errore}</p>}</div>;
}

export function campoCalcoloKit({ campo, row, completa, righe, disabled, onChange, onSave, compatto = false }: {
  campo: typeof CAMPI_SEMPLICI_KIT[number]; row: Partial<CampiSempliciKit> & { ordine: number }; completa: boolean;
  righe: readonly RigaMenuKit[]; disabled: boolean; onChange: (campo: CampoSempliceKit, n: number | null) => void;
  onSave?: (campo: CampoSempliceKit, n: number | null) => Promise<void>; compatto?: boolean;
}) {
  const etichetta = campo.codice === 'n_pezzi' && !completa ? 'Quantità per kit' : campo.etichetta;
  if (campo.codice === 'riga_rif') return <Select disabled={disabled} value={row.riga_rif == null ? '__none__' : String(row.riga_rif)}
    onValueChange={v => { const n = v === '__none__' ? null : Number(v); onChange('riga_rif', n); if (onSave) void onSave('riga_rif', n).catch(() => undefined); }}>
    <SelectTrigger aria-label={`Calcola dalla riga ${row.ordine}`} title={row.riga_rif == null ? campo.aiuto : righe.find(r => r.ordine === row.riga_rif)?.descrizione ?? `Riga ${row.riga_rif} non presente`}
      className={compatto ? 'h-10 min-w-0 px-1 text-xs [&>span]:min-w-0 [&>span]:truncate' : 'min-h-11 min-w-0 [&>span]:min-w-0 [&>span]:truncate'}><SelectValue placeholder="Nessuna"/></SelectTrigger>
    <SelectContent><SelectItem value="__none__">Nessuna</SelectItem>{row.riga_rif != null && !righe.some(r => r.ordine === row.riga_rif && r.ordine !== row.ordine) && <SelectItem value={String(row.riga_rif)}>{row.riga_rif} — riga non disponibile</SelectItem>}
      {righe.filter(r => r.ordine !== row.ordine).map(r => <SelectItem key={r.ordine} value={String(r.ordine)} className="max-w-sm whitespace-normal break-words">{r.ordine} — {r.descrizione}</SelectItem>)}</SelectContent>
  </Select>;
  return <NumeroKit campo={campo.codice} etichetta={`${etichetta} riga ${row.ordine}`} valore={row[campo.codice]} disabled={disabled} compatto={compatto}
    onChange={n => onChange(campo.codice, n)} {...(onSave ? { onSave: (n: number | null) => onSave(campo.codice, n) } : {})}/>;
}

export function CampiCalcoloKit(props: Omit<Parameters<typeof campoCalcoloKit>[0], 'campo'> & { aiuti?: boolean }) {
  const campi = props.completa ? CAMPI_SEMPLICI_KIT : CAMPI_SEMPLICI_KIT.filter(c => c.codice === 'n_pezzi');
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{campi.map(c => <div key={c.codice} className={`min-w-0 space-y-1 ${props.aiuti && c.codice === 'riga_rif' ? 'col-span-2 sm:col-span-3 lg:col-span-4' : ''}`}>
    <div className="flex items-center gap-1"><Label className="text-xs">{c.codice === 'n_pezzi' && !props.completa ? 'Quantità per kit' : c.etichetta}</Label>{c.codice === 'riga_rif' && !props.aiuti && <AiutoCalcolaDallaRiga/>}</div>
    {campoCalcoloKit({ ...props, campo: c })}{props.aiuti && <p className="break-words text-xs text-muted-foreground">{c.aiuto}</p>}
  </div>)}</div>;
}

export const formatoQuantitaKit = (n: number | null | undefined) => n == null ? '—' : formatNumeroIt(n, { maxDecimals: 6 });