import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { chiaveNotePreventivo, eliminaNotaPreventivo, fetchNotePreventivo, salvaNotaPreventivo, type NotaPreventivo } from "@/lib/preventivi-note";
import { chiaveSalvaPreventivo } from "@/lib/use-stato-salvataggio-preventivo";

export function NotePreventivo({ id, modificabile }: { id: string; modificabile: boolean }) {
  const qc = useQueryClient();
  const { data: note = [], isPending, error } = useQuery({ queryKey: chiaveNotePreventivo(id), queryFn: () => fetchNotePreventivo(id) });
  const [aggiungi, setAggiungi] = useState(false);
  const [modifica, setModifica] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<NotaPreventivo | null>(null);
  const salva = useMutation({
    mutationKey: chiaveSalvaPreventivo(id),
    mutationFn: (nota: { id?: string; titolo: string; testo: string; ordine: number | null }) => salvaNotaPreventivo(id, nota),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: chiaveNotePreventivo(id) }); setAggiungi(false); setModifica(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const elimina = useMutation({
    mutationKey: chiaveSalvaPreventivo(id), mutationFn: (notaId: string) => eliminaNotaPreventivo(id, notaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chiaveNotePreventivo(id) }); setDaEliminare(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <div className="mt-2 space-y-2">
    {isPending && <p className="text-xs text-muted-foreground">Caricamento note…</p>}
    {error && <p role="alert" className="text-xs text-destructive">Impossibile caricare le note.</p>}
    {note.map(nota => modificabile && modifica === nota.id
      ? <EditorNota key={nota.id} nota={nota} occupato={salva.isPending} onSalva={salva.mutate} onAnnulla={() => setModifica(null)} />
      : <div key={nota.id} className="flex min-w-0 items-start gap-1 border-t pt-2">
        <div className="min-w-0 flex-1 text-xs"><p className="break-words font-bold">{nota.titolo}</p>{nota.testo && <p className="whitespace-pre-wrap break-words">{nota.testo}</p>}</div>
        {modificabile && <div className="flex shrink-0"><Button variant="ghost" size="icon" className="size-10" title="Modifica nota" aria-label={`Modifica nota ${nota.titolo}`} onClick={() => setModifica(nota.id)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-10 text-destructive" title="Elimina nota" aria-label={`Elimina nota ${nota.titolo}`} onClick={() => setDaEliminare(nota)}><Trash2 className="size-3.5" /></Button></div>}
      </div>)}
    {modificabile && (aggiungi
      ? <EditorNota key="nuova" nota={{ titolo: "", testo: null, ordine: Math.max(0, ...note.map(n => n.ordine ?? 0)) + 1 }} occupato={salva.isPending} onSalva={salva.mutate} onAnnulla={() => setAggiungi(false)} />
      : <Button variant="ghost" size="sm" className="min-h-10 text-xs" onClick={() => setAggiungi(true)}><Plus className="size-3.5" />Aggiungi nota</Button>)}
    <AlertDialog open={!!daEliminare} onOpenChange={v => { if (!v && !elimina.isPending) setDaEliminare(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare la nota?</AlertDialogTitle><AlertDialogDescription>La nota «{daEliminare?.titolo}» verrà eliminata definitivamente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={elimina.isPending}>Annulla</AlertDialogCancel><AlertDialogAction disabled={elimina.isPending} onClick={e => { e.preventDefault(); if (daEliminare) elimina.mutate(daEliminare.id); }}>Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function EditorNota({ nota, occupato, onSalva, onAnnulla }: {
  nota: { id?: string; titolo: string; testo: string | null; ordine: number | null }; occupato: boolean;
  onSalva: (nota: { id?: string; titolo: string; testo: string; ordine: number | null }) => void; onAnnulla: () => void;
}) {
  const [titolo, setTitolo] = useState(nota.titolo);
  const [testo, setTesto] = useState(nota.testo ?? "");
  const [errore, setErrore] = useState(false);
  // Il blur dell'intera riga salva entrambi i campi; spostarsi Titolo → Testo non crea scritture parziali.
  return <div className="space-y-1 border-t pt-2" onBlur={e => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (occupato) return;
    if (!titolo.trim()) { setErrore(true); return; }
    if (titolo.trim() !== nota.titolo || testo !== (nota.testo ?? "")) onSalva({ id: nota.id, titolo, testo, ordine: nota.ordine });
  }}>
    <div className="flex min-w-0 items-center gap-1"><Input aria-label="Titolo nota" placeholder="Titolo" className="h-7 min-w-0 bg-card text-xs md:text-xs" value={titolo} onChange={e => { setTitolo(e.target.value); setErrore(false); }} disabled={occupato} /><Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Chiudi modifica nota" title="Chiudi modifica nota" onClick={onAnnulla} disabled={occupato}><X className="size-3.5" /></Button></div>
    <Textarea aria-label="Testo nota" placeholder="Testo" rows={3} className="min-h-0 bg-card text-xs md:text-xs" value={testo} onChange={e => setTesto(e.target.value)} disabled={occupato} />
    {errore && <p role="alert" className="text-xs text-destructive">Inserisci il titolo della nota.</p>}
  </div>;
}
