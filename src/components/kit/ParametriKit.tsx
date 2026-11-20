import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { righeUsanoParametroKit, validaParametroKit, type KitParametro, type SalvataggioParametroKit } from '@/lib/kit-regole-ui';
import type { ComponenteRegoleKit } from '@/lib/kit-regole';
import { formatNumeroIt, parseNumeroIt } from '@/lib/numero-it';

export function ParametriKit({ parametri, componenti, modificabile, classiBordo, onSave, onDelete, onReorder }: {
  parametri: readonly KitParametro[]; componenti: readonly ComponenteRegoleKit[]; modificabile: boolean; classiBordo: string;
  onSave: (id: string | null, p: SalvataggioParametroKit) => Promise<void>;
  onDelete: (id: string) => Promise<void>; onReorder: (id: string, verso: -1 | 1) => Promise<void>;
}) {
  const [form, setForm] = useState<{ parametro: KitParametro | null } | null>(null);
  const [conferma, setConferma] = useState<{ parametro: KitParametro; valori: SalvataggioParametroKit | null } | null>(null);
  const [errore, setErrore] = useState('');
  const [busy, setBusy] = useState(false);
  async function esegui(action: () => Promise<void>) {
    try { setErrore(''); setBusy(true); await action(); }
    catch (e) { setErrore(e instanceof Error ? e.message : 'Operazione non riuscita.'); throw e; }
    finally { setBusy(false); }
  }
  const riferimenti = conferma ? righeUsanoParametroKit(conferma.parametro.codice, componenti) : [];
  return <section className="min-w-0 space-y-3" aria-label="Parametri del kit">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><h2 className="text-base font-semibold">Parametri del kit</h2>{modificabile && <Button variant="outline" size="sm" className="min-h-10" onClick={() => { setErrore(''); setForm({ parametro: null }); }}><Plus className="h-4 w-4"/>Aggiungi parametro</Button>}</div>
    {parametri.length === 0 ? <p className="text-sm text-muted-foreground">Nessun parametro.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{parametri.map((p, indice) => <Card key={p.id} className={`min-w-0 border-l-4 ${classiBordo}`}><CardContent className="space-y-2 p-3 text-xs">
      <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="break-all font-mono text-muted-foreground">{p.codice}</p><p className="break-words font-semibold">{p.etichetta}</p></div><span className="shrink-0 text-muted-foreground">{p.tipo === 'scelta' ? 'Scelta' : 'Numero'}</span></div>
      <p>Predefinito: <span className="font-mono">{formatNumeroIt(p.valore_default, { maxDecimals: 6 })}</span>{p.um ? ` ${p.um}` : ''}</p>
      {p.tipo === 'scelta' && <p className="break-words text-muted-foreground">Valori ammessi: {p.valori_ammessi?.map(v => formatNumeroIt(v, { maxDecimals: 6 })).join('; ')}</p>}
      {p.note && <p className="break-words text-muted-foreground">{p.note}</p>}
      {modificabile && <div className="flex flex-wrap justify-end gap-1">
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Sposta su ${p.codice}`} title="Sposta su" disabled={busy || indice === 0} onClick={() => { void esegui(() => onReorder(p.id, -1)).catch(() => {}); }}><ArrowUp className="h-4 w-4"/></Button>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Sposta giù ${p.codice}`} title="Sposta giù" disabled={busy || indice === parametri.length - 1} onClick={() => { void esegui(() => onReorder(p.id, 1)).catch(() => {}); }}><ArrowDown className="h-4 w-4"/></Button>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Modifica ${p.codice}`} title="Modifica parametro" disabled={busy} onClick={() => { setErrore(''); setForm({ parametro: p }); }}><Pencil className="h-4 w-4"/></Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label={`Elimina ${p.codice}`} title="Elimina parametro" disabled={busy} onClick={() => { setErrore(''); setConferma({ parametro: p, valori: null }); }}><Trash2 className="h-4 w-4"/></Button>
      </div>}
    </CardContent></Card>)}</div>}
    {errore && !form && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    {form && <Dialog open onOpenChange={open => { if (!open && !busy) setForm(null); }}><DialogContent><DialogHeader><DialogTitle>{form.parametro ? 'Modifica parametro' : 'Aggiungi parametro'}</DialogTitle></DialogHeader>
      <ParametroForm key={form.parametro?.id ?? 'nuovo'} parametro={form.parametro} ordine={Math.max(-1, ...parametri.map(p => p.ordine)) + 1} busy={busy} errore={errore} onCancel={() => setForm(null)} onSave={async valori => {
        if (parametri.some(p => p.id !== form.parametro?.id && p.codice === valori.codice)) { setErrore('Codice parametro già usato in questo kit.'); return; }
        if (form.parametro && form.parametro.codice !== valori.codice && righeUsanoParametroKit(form.parametro.codice, componenti).length) { setConferma({ parametro: form.parametro, valori }); return; }
        await esegui(() => onSave(form.parametro?.id ?? null, valori)); setForm(null);
      }}/></DialogContent></Dialog>}
    <AlertDialog open={conferma != null} onOpenChange={open => { if (!open && !busy) setConferma(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{conferma?.valori ? 'Rinominare il parametro?' : 'Eliminare il parametro?'}</AlertDialogTitle><AlertDialogDescription>{riferimenti.length ? 'Le righe seguenti usano questo parametro. Le regole non saranno aggiornate: dovrai correggerle dopo la conferma.' : 'Il parametro verrà eliminato dal kit.'}</AlertDialogDescription></AlertDialogHeader>
      {riferimenti.length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{riferimenti.map(r => <li className="break-words" key={r.ordine}>Riga {r.ordine} · {r.descrizione}</li>)}</ul>}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); if (!conferma) return; void esegui(async () => { if (conferma.valori) await onSave(conferma.parametro.id, conferma.valori); else await onDelete(conferma.parametro.id); setConferma(null); setForm(null); }).catch(() => {}); }}>Conferma</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}

function ParametroForm({ parametro, ordine, busy, errore, onSave, onCancel }: {
  parametro: KitParametro | null; ordine: number; busy: boolean; errore: string;
  onSave: (p: SalvataggioParametroKit) => Promise<void>; onCancel: () => void;
}) {
  const [codice, setCodice] = useState(parametro?.codice ?? '');
  const [etichetta, setEtichetta] = useState(parametro?.etichetta ?? '');
  const [tipo, setTipo] = useState(parametro?.tipo ?? 'numero');
  const [ammessi, setAmmessi] = useState(parametro?.valori_ammessi?.map(v => String(v).replace('.', ',')).join('; ') ?? '');
  const [valore, setValore] = useState(String(parametro?.valore_default ?? '').replace('.', ','));
  const [um, setUm] = useState(parametro?.um ?? '');
  const [note, setNote] = useState(parametro?.note ?? '');
  const [locale, setLocale] = useState('');
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); void (async () => {
    try {
      setLocale(''); const valore_default = parseNumeroIt(valore);
      const valori_ammessi = tipo === 'scelta' ? ammessi.split(';').map(v => parseNumeroIt(v)) : null;
      if (valore_default == null || valori_ammessi?.some(v => v == null)) throw new Error('Indica numeri validi, con la virgola per i decimali.');
      const p = validaParametroKit({ codice, etichetta, tipo, valore_default, valori_ammessi: valori_ammessi?.filter((v): v is number => v != null) ?? null, um: um.trim() || null, note: note.trim() || null, ordine: parametro?.ordine ?? ordine });
      await onSave(p);
    } catch (e) { setLocale(e instanceof Error ? e.message : 'Parametro non salvato.'); }
  })(); }}>
    <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid min-w-0 gap-1"><Label htmlFor="parametro-codice">Codice *</Label><Input id="parametro-codice" className="min-h-11 font-mono" value={codice} onChange={e => setCodice(e.target.value.toUpperCase())}/></div>
      <div className="grid min-w-0 gap-1"><Label htmlFor="parametro-etichetta">Etichetta *</Label><Input id="parametro-etichetta" className="min-h-11" value={etichetta} onChange={e => setEtichetta(e.target.value)}/></div>
      <div className="grid min-w-0 gap-1"><Label htmlFor="parametro-tipo">Tipo</Label><Select value={tipo} onValueChange={setTipo}><SelectTrigger id="parametro-tipo" className="min-h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="numero">Numero</SelectItem><SelectItem value="scelta">Scelta</SelectItem></SelectContent></Select></div>
      <div className="grid min-w-0 gap-1"><Label htmlFor="parametro-default">Valore predefinito *</Label><Input id="parametro-default" inputMode="decimal" className="min-h-11" value={valore} onChange={e => setValore(e.target.value)}/></div>
      {tipo === 'scelta' && <div className="grid min-w-0 gap-1 sm:col-span-2"><Label htmlFor="parametro-ammessi">Valori ammessi, separati da ;</Label><Input id="parametro-ammessi" className="min-h-11" placeholder="0,4; 0,6" value={ammessi} onChange={e => setAmmessi(e.target.value)}/></div>}
      <div className="grid min-w-0 gap-1"><Label htmlFor="parametro-um">Unità di misura</Label><Input id="parametro-um" className="min-h-11" value={um} onChange={e => setUm(e.target.value)}/></div>
      <div className="grid min-w-0 gap-1 sm:col-span-2"><Label htmlFor="parametro-note">Note</Label><Textarea id="parametro-note" rows={2} value={note} onChange={e => setNote(e.target.value)}/></div>
    </fieldset>
    {(locale || errore) && <p role="alert" className="text-sm text-destructive">{locale || errore}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Annulla</Button><Button type="submit" disabled={busy}>Salva parametro</Button></DialogFooter>
  </form>;
}