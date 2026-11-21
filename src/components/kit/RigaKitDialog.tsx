import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArticoloGammaPicker } from '@/components/preventivatore/ArticoloGammaPicker';
import { ArticoloInDefinizioneDialog } from '@/components/preventivatore/ArticoloInDefinizioneDialog';
import { calcolaKitRegole } from '@/lib/kit-regole';
import { lineaPreventivo } from '@/lib/linee-preventivo';
import { patchArticoloKit, patchManualeKit } from '@/lib/kit-config';
import { prossimoOrdineKit } from '@/lib/kit-semplice-ui';
import type { KitConComponenti, KitComponenteUpdate } from '@/lib/kit-api';
import type { KitParametro } from '@/lib/kit-regole-ui';
import { CampiCalcoloKit, NumeroKit, formatoQuantitaKit } from './CampiCalcoloKit';

type Riga = KitConComponenti['componenti'][number];
export function RigaKitDialog({ kit, row, parametri, onClose, onSave }: {
  kit: KitConComponenti; row: Riga | null; parametri: readonly KitParametro[];
  onClose: () => void; onSave: (patch: KitComponenteUpdate) => Promise<void>;
}) {
  const [patch, setPatch] = useState<KitComponenteUpdate>({});
  const [gamma, setGamma] = useState(row?.articolo ?? null);
  const [manuale, setManuale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const ordine = row?.ordine ?? prossimoOrdineKit(kit.componenti);
  const completa = lineaPreventivo(kit.linea).kit.calcoloSemplice === 'completo';
  const draft = { ...row, ...patch, ordine };
  const componenti = row ? kit.componenti.map(c => c.id === row.id ? draft : c) : [...kit.componenti, draft];
  const risultato = calcolaKitRegole({ componenti, parametri }).find(r => r.ordine === ordine);
  const righe = kit.componenti.map(c => ({ ordine: c.ordine, descrizione: c.articolo?.descrizione ?? c.descrizione ?? c.articolo_codice ?? 'Articolo da definire' }));
  const cambia = (p: KitComponenteUpdate) => setPatch(s => ({ ...s, ...p }));
  const salva = async () => {
    if (!draft.articolo_codice && !draft.descrizione?.trim()) { setErrore('Scegli un articolo Gamma oppure definisci la descrizione dell’articolo manuale.'); return; }
    setBusy(true); setErrore('');
    try { await onSave(patch); onClose(); }
    catch (e) { setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:p-0">
    <DialogHeader className="shrink-0 border-b p-4 pr-12"><DialogTitle>{row ? 'Modifica riga' : 'Nuova riga'} · {ordine}</DialogTitle><DialogDescription>{kit.nome}</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto p-4">
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <section className="min-w-0 space-y-2"><h3 className="text-sm font-semibold">Articolo</h3>
          <div className="min-w-0 [&_button[role=combobox]]:min-h-11"><ArticoloGammaPicker preventivoId={`kit:${kit.id}`} codice={draft.articolo_codice ?? null} descrizione={gamma?.descrizione ?? null}
            onChange={a => { cambia(patchArticoloKit(a.codice, a)); setGamma({ codice: a.codice, descrizione: a.descrizione, um: a.um, peso_netto: null }); }}/></div>
          <p className="break-words text-sm">{draft.articolo_codice ?? draft.codice_articolo_fornitore ?? '—'} — {draft.articolo_codice ? gamma?.descrizione : draft.descrizione}</p>
          <p className="text-xs text-muted-foreground">U.M. {draft.articolo_codice ? gamma?.um ?? '—' : draft.um ?? '—'}</p>
          <Button variant="outline" className="min-h-10" onClick={() => setManuale(true)}><Search className="h-4 w-4"/>{draft.articolo_codice ? 'Articolo manuale' : 'Definisci articolo manuale'}</Button>
        </section>
        <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Calcolo</h3><CampiCalcoloKit row={draft} completa={completa} righe={righe} disabled={busy} aiuti onChange={(campo, n) => cambia({ [campo]: n })}/></section>
        <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Peso e note</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Peso unitario (kg per unità Gamma)</Label><NumeroKit campo="peso_unitario" etichetta={`Peso unitario riga ${ordine}`} valore={draft.peso_unitario} disabled={busy} onChange={n => cambia({ peso_unitario: n })}/></div>
            <div className="space-y-1"><Label htmlFor="riga-kit-note">Note</Label><Textarea id="riga-kit-note" value={draft.note ?? ''} onChange={e => cambia({ note: e.target.value || null })}/></div></div>
        </section>
        {row && <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Valore fisso (vecchio metodo)</h3><div className="max-w-xs"><Label>Incidenza</Label><NumeroKit campo="incidenza" etichetta={`Incidenza fissa riga ${ordine}`} valore={draft.incidenza} disabled={busy} onChange={n => cambia({ incidenza: n })}/></div><p className="text-xs text-muted-foreground">Vale solo se tutti i campi di calcolo sono vuoti e non c’è una regola precedente.</p></section>}
      </fieldset>
      {errore && <p role="alert" className="break-words text-sm text-destructive">{errore}</p>}
    </div>
    <div className="shrink-0 border-t bg-card px-4 py-3 text-sm" data-anteprima-dialog><div className="flex flex-wrap gap-x-6 gap-y-1"><span>Incidenza: <strong>{formatoQuantitaKit(risultato?.quantitaPerUnita)}</strong> {draft.articolo_codice ? gamma?.um : draft.um} / {kit.um_base}</span><span>Peso: <strong>{formatoQuantitaKit(risultato?.pesoPerUnita)}</strong> kg/{kit.um_base}</span></div>{risultato?.errore && <p role="alert" className="mt-1 break-words text-xs text-destructive">{risultato.errore}</p>}</div>
    <DialogFooter className="shrink-0 gap-2 border-t p-4"><Button variant="outline" disabled={busy} onClick={onClose}>Annulla</Button><Button disabled={busy} onClick={() => void salva()}>{busy ? 'Salvataggio…' : 'Salva riga'}</Button></DialogFooter>
    {manuale && <ArticoloInDefinizioneDialog open soloAnagrafica row={{ ...draft, quantita: 1, prezzo_unit: null }} onOpenChange={setManuale}
      onPatch={p => { cambia(patchManualeKit(p)); setGamma(null); }} onSceltaGamma={a => { cambia(patchArticoloKit(a.codice, a)); setGamma({ codice: a.codice, descrizione: a.descrizione, um: a.um, peso_netto: null }); }}/ >}
  </DialogContent></Dialog>;
}