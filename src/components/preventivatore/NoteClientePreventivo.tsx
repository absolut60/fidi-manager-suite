import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Save, Pencil, Trash2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useLineeUtente } from '@/lib/use-linee-utente';
import { chiaveSalvaPreventivo } from '@/lib/use-stato-salvataggio-preventivo';
import { messaggioEsitoEliminazione } from '@/lib/esito-eliminazione';
import type { PreventivoConDettagli } from '@/lib/preventivi-api';
import { aggiungiNotaCliente, chiaveLibreriaNote, leggiLibreriaNote, salvaNotaLibreria, eliminaNotaLibreria, puoLeggereLibreria, puoInserireLibreria, puoGestireNotaLibreria, type NotaLibreria } from '@/lib/note-preventivo';
import { RiquadroScheda } from './RiquadroScheda';

const finestra = 'flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none p-3 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-lg sm:p-5';
function cresci(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function NoteClientePreventivo({ prev, modificabile, onSave }: {
  prev: Pick<PreventivoConDettagli, 'id' | 'linea' | 'note_cliente'>;
  modificabile: boolean;
  onSave: (testo: string | null) => Promise<void>;
}) {
  const { user, roles } = useAuth();
  const { data: linee } = useLineeUtente(user?.id);
  const utente = { id: user?.id ?? null, roles, linee: linee?.linee_abilitate ?? [] };
  const lettura = puoLeggereLibreria(utente, prev.linea);
  const inserimento = puoInserireLibreria(utente, prev.linea);
  const [testo, setTesto] = useState(prev.note_cliente ?? '');
  const testoRef = useRef(testo);
  const persistito = useRef(prev.note_cliente ?? '');
  const inviato = useRef(prev.note_cliente ?? '');
  const coda = useRef(Promise.resolve());
  const area = useRef<HTMLTextAreaElement>(null);
  const [libreria, setLibreria] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [form, setForm] = useState<{ modo: 'salva' | 'modifica'; id: string; titolo: string; testo: string } | null>(null);
  const [eliminanda, setEliminanda] = useState<NotaLibreria | null>(null);
  const qc = useQueryClient();
  const chiave = chiaveLibreriaNote(prev.linea, utente.id);
  const note = useQuery({ queryKey: chiave, queryFn: () => leggiLibreriaNote(prev.linea), enabled: lettura && (libreria || !!form) });
  useEffect(() => {
    const nuovo = prev.note_cliente ?? '';
    // Una rilettura di altri campi non deve sovrascrivere il testo ancora in modifica.
    if (testoRef.current === persistito.current) { testoRef.current = nuovo; setTesto(nuovo); inviato.current = nuovo; }
    persistito.current = nuovo;
  }, [prev.note_cliente]);
  useEffect(() => { cresci(area.current); }, [testo]);
  const cambia = (v: string) => { testoRef.current = v; setTesto(v); };
  const salvaTesto = (v: string) => {
    if (!modificabile || v === inviato.current) return coda.current;
    inviato.current = v;
    // Blur e inserimento dalla libreria condividono la stessa coda, senza scritture invertite.
    coda.current = coda.current.then(async () => {
      try { await onSave(v || null); }
      catch { inviato.current = persistito.current; }
    });
    return coda.current;
  };
  const salva = useMutation({ mutationKey: chiaveSalvaPreventivo(prev.id),
    mutationFn: async () => {
      if (!form || !utente.id) throw new Error('Nota non disponibile');
      return salvaNotaLibreria(prev.linea, { ...(form.id ? { id: form.id } : {}), titolo: form.titolo, testo: form.testo }, utente.id);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: chiave }); setForm(null); toast.success('Nota salvata in libreria'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const elimina = useMutation({ mutationKey: chiaveSalvaPreventivo(prev.id),
    mutationFn: async () => {
      if (!eliminanda) throw new Error('Nota non disponibile');
      const esito = await eliminaNotaLibreria(eliminanda.id);
      if (esito.tipo !== 'eliminato') throw new Error(messaggioEsitoEliminazione(esito, 'questa nota'));
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: chiave }); setEliminanda(null); toast.success('Nota eliminata'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const modificabili = (note.data ?? []).filter(n => puoGestireNotaLibreria(utente, n));
  const gestibile = form && (form.id ? modificabili.some(n => n.id === form.id) : inserimento);
  const trovate = (note.data ?? []).filter(n => `${n.titolo}\n${n.testo}`.toLocaleLowerCase('it-IT').includes(ricerca.toLocaleLowerCase('it-IT')));
  return <RiquadroScheda titolo="Note per il cliente" icona={StickyNote} tono="verde" className="lg:col-span-2">
    <p className="mb-2 text-xs text-muted-foreground">Stampate nel documento</p>
    {modificabile ? <Textarea ref={area} aria-label="Note per il cliente" rows={3} className="min-h-24 resize-none overflow-hidden bg-card text-sm" value={testo} onChange={e => cambia(e.target.value)} onBlur={() => { void salvaTesto(testoRef.current); }} />
      : <p className="whitespace-pre-wrap break-words text-sm">{testo || '—'}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {lettura && <Button size="sm" variant="outline" className="min-h-10" onClick={() => setLibreria(true)}><BookOpen className="mr-2 size-4" />Dalla libreria</Button>}
      {inserimento && <Button size="sm" variant="outline" className="min-h-10" onClick={() => setForm({ modo: 'salva', id: '', titolo: '', testo: testoRef.current })}><Save className="mr-2 size-4" />Salva in libreria</Button>}
    </div>
    <Dialog open={libreria} onOpenChange={setLibreria}><DialogContent className={finestra}>
      <DialogHeader className="shrink-0 pr-8 text-left"><DialogTitle>Note dalla libreria</DialogTitle><DialogDescription>Note della linea del documento</DialogDescription></DialogHeader>
      <Input aria-label="Cerca nelle note" placeholder="Cerca titolo o testo" className="min-h-11 shrink-0" value={ricerca} onChange={e => setRicerca(e.target.value)} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto sm:max-h-[55dvh]">
        {note.isLoading && <p className="text-sm">Caricamento note…</p>}
        {note.isError && <p role="alert" className="text-sm text-destructive">Impossibile leggere le note. <Button variant="link" onClick={() => { void note.refetch(); }}>Riprova</Button></p>}
        {!note.isLoading && !note.isError && !trovate.length && <p className="text-sm text-muted-foreground">Nessuna nota trovata</p>}
        {trovate.map(n => <div key={n.id} className="min-w-0 rounded-md border p-3">
          <Button variant="ghost" disabled={!modificabile} className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal p-0 text-left disabled:opacity-100" onClick={() => { const v = aggiungiNotaCliente(testoRef.current, n.testo); cambia(v); void salvaTesto(v); setLibreria(false); }}>
            <span className="block min-w-0"><strong className="block break-words text-sm">{n.titolo}</strong><span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-xs font-normal text-muted-foreground">{n.testo}</span></span>
          </Button>
          {puoGestireNotaLibreria(utente, n) && <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="min-h-10" aria-label={`Modifica ${n.titolo}`} onClick={() => setForm({ modo: 'modifica', id: n.id, titolo: n.titolo, testo: n.testo })}><Pencil className="mr-2 size-4" />Modifica</Button>
            <Button size="sm" variant="outline" className="min-h-10" aria-label={`Elimina ${n.titolo}`} onClick={() => setEliminanda(n)}><Trash2 className="mr-2 size-4" />Elimina</Button>
          </div>}
        </div>)}
      </div>
      <DialogFooter className="shrink-0"><Button variant="outline" className="min-h-10" onClick={() => setLibreria(false)}>Chiudi</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!form} onOpenChange={open => { if (!open && !salva.isPending) setForm(null); }}><DialogContent className={finestra}>
      <DialogHeader className="shrink-0 pr-8 text-left"><DialogTitle>{form?.modo === 'modifica' ? 'Modifica nota' : 'Salva in libreria'}</DialogTitle><DialogDescription>La nota sarà condivisa nella stessa linea</DialogDescription></DialogHeader>
      {form && <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={e => { e.preventDefault(); if (gestibile && !salva.isPending) salva.mutate(); }}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto sm:max-h-[60dvh]">
          {form.modo === 'salva' && <div className="space-y-2"><Label>Salva come</Label><Select value={form.id || '__nuova__'} onValueChange={id => { const n = modificabili.find(n => n.id === id); setForm({ ...form, id: n?.id ?? '', titolo: n?.titolo ?? '' }); }}><SelectTrigger aria-label="Salva come" className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__nuova__">Nuova nota</SelectItem>{modificabili.map(n => <SelectItem key={n.id} value={n.id} className="whitespace-normal break-words">Aggiorna: {n.titolo}</SelectItem>)}</SelectContent></Select></div>}
          <div className="space-y-2"><Label htmlFor="nota-libreria-titolo">Titolo *</Label><Input id="nota-libreria-titolo" required maxLength={120} className="min-h-11" value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="nota-libreria-testo">Testo *</Label><Textarea id="nota-libreria-testo" required rows={7} className="bg-card text-sm" value={form.testo} onChange={e => setForm({ ...form, testo: e.target.value })} /></div>
          {note.isError && <p role="alert" className="text-sm text-destructive">Impossibile leggere le note esistenti</p>}
        </div>
        <DialogFooter className="shrink-0"><Button type="button" variant="outline" className="min-h-10" disabled={salva.isPending} onClick={() => setForm(null)}>Annulla</Button><Button type="submit" className="min-h-10" disabled={!gestibile || !form.titolo.trim() || !form.testo.trim() || salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Salva nota'}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
    <AlertDialog open={!!eliminanda} onOpenChange={open => { if (!open && !elimina.isPending) setEliminanda(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare questa nota?</AlertDialogTitle><AlertDialogDescription>La nota «{eliminanda?.titolo}» sarà rimossa dalla libreria; i testi già aggiunti ai documenti restano invariati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-10" disabled={elimina.isPending}>Annulla</AlertDialogCancel><AlertDialogAction className="min-h-10" disabled={elimina.isPending} onClick={e => { e.preventDefault(); elimina.mutate(); }}>Elimina nota</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </RiquadroScheda>;
}