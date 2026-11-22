import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cercaFornitoriRiga, fornitoriCollegatiArticolo, type FornitoreOrdine } from '@/lib/fornitori-riga-ordine';

export function FornitoreRigaOrdine({ codice, fornitore, modificabile, caricamento, errore, onSave }: {
  codice: string; fornitore: FornitoreOrdine | null; modificabile: boolean; caricamento: boolean; errore: boolean;
  onSave: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [termine, setTermine] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState('');
  const collegati = useQuery({ queryKey: ['fornitori-articolo-ordine', codice], queryFn: () => fornitoriCollegatiArticolo(codice), enabled: open });
  const ricerca = useQuery({ queryKey: ['fornitori-ricerca-riga', termine.trim()], queryFn: () => cercaFornitoriRiga(termine), enabled: open && termine.trim().length >= 2 });
  const scegli = async (id: string) => {
    setSalvando(true); setErroreSalvataggio('');
    try { await onSave(id); setOpen(false); }
    catch (e) { setErroreSalvataggio(e instanceof Error ? e.message : 'Fornitore non salvato. Riprova.'); }
    finally { setSalvando(false); }
  };
  return <div className="flex min-w-0 items-center gap-1 px-1.5 text-[11px]">
    <span className={fornitore || caricamento || errore ? 'min-w-0 break-words text-muted-foreground' : 'min-w-0 break-words text-warning-foreground'}>
      {caricamento ? 'Caricamento fornitore…' : errore ? 'Fornitore non disponibile. Riprova.' : fornitore ? fornitore.ragione_sociale || 'Fornitore selezionato' : "Scegli il fornitore: serve per l'ordine al fornitore"}
    </span>
    {modificabile && <TooltipProvider><Tooltip><TooltipTrigger asChild>
      {/* Il corpo ordine mantiene il fieldset disabilitato: solo questa azione è abilitata. */}
      <Button asChild variant="ghost" size="icon" className="size-10 shrink-0">
        <span role="button" tabIndex={0} aria-label="Cambia fornitore della riga" onClick={() => { setTermine(''); setOpen(true); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTermine(''); setOpen(true); } }}><Pencil className="size-3.5" /></span>
      </Button>
    </TooltipTrigger><TooltipContent>Cambia fornitore</TooltipContent></Tooltip></TooltipProvider>}
    {open && <Dialog open onOpenChange={setOpen}><DialogContent className="w-[calc(100vw-2rem)] max-w-lg min-w-0 max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Fornitore della riga</DialogTitle><DialogDescription>{codice}</DialogDescription></DialogHeader>
      <div className="space-y-2 border-l-4 border-l-pv-blu bg-card pl-3">
        <p className="text-xs font-semibold">Fornitori dell'articolo</p>
        {collegati.isPending ? <p className="text-xs text-muted-foreground">Caricamento…</p> : collegati.error ? <p role="alert" className="text-xs text-destructive">Fornitori non disponibili. Riprova.</p> : collegati.data.length ? collegati.data.map(f => <Button key={f.id} variant={fornitore?.id === f.id ? 'outline' : 'ghost'} disabled={salvando} className="h-auto min-h-10 w-full justify-start whitespace-normal text-left text-xs" onClick={() => void scegli(f.id)}><span className="min-w-0 break-words">{f.ragione_sociale || '—'}{f.preferenziale && <span className="ml-2 text-muted-foreground">Preferenziale</span>}</span></Button>) : <p className="text-xs text-muted-foreground">Nessun fornitore collegato</p>}
      </div>
      <Input aria-label="Cerca fornitore" placeholder="Cerca ragione sociale o alias…" value={termine} onChange={e => setTermine(e.target.value)} className="min-h-11" />
      {termine.trim().length >= 2 && <div className="space-y-1">{ricerca.isPending ? <p className="text-xs text-muted-foreground">Ricerca…</p> : ricerca.error ? <p role="alert" className="text-xs text-destructive">Ricerca non disponibile. Riprova.</p> : ricerca.data?.length ? ricerca.data.map(f => <Button key={f.id} variant="ghost" disabled={salvando} className="h-auto min-h-10 w-full justify-start whitespace-normal text-left text-xs" onClick={() => void scegli(f.id)}><span className="min-w-0 break-words">{f.ragione_sociale || f.alias || '—'}</span></Button>) : <p className="text-xs text-muted-foreground">Nessun risultato</p>}</div>}
      {erroreSalvataggio && <p role="alert" className="text-xs text-destructive">{erroreSalvataggio}</p>}
    </DialogContent></Dialog>}
  </div>;
}