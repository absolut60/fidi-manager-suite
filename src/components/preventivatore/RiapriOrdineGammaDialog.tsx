import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { puoEsportareGamma } from '@/lib/esportazione-gamma';
import { riapriOrdineGamma } from '@/lib/esportazioni-gamma-storico';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function RiapriOrdineGammaDialog({ ordine, onClose }: { ordine: { id: string; numero: string | null }; onClose: () => void }) {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const occupato = useRef(false);
  if (!puoEsportareGamma(hasRole)) return null;
  return <Dialog open onOpenChange={v => { if (!v && !occupato.current) onClose(); }}>
    <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90dvh] min-w-0 max-w-lg overflow-y-auto">
      <DialogHeader className="pr-6 text-left"><DialogTitle className="break-words">Riapri {ordine.numero ?? 'ordine'} per reimportare</DialogTitle><DialogDescription>L'ordine tornerà in Da esportare e potrà essere modificato; l'esportazione precedente resta nello storico.</DialogDescription></DialogHeader>
      <div className="grid min-w-0 gap-2"><Label htmlFor="motivo-riapertura-gamma">Motivo (facoltativo)</Label><Textarea id="motivo-riapertura-gamma" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={inCorso} rows={3} /></div>
      {errore && <p role="alert" className="break-words text-sm text-destructive">{errore}</p>}
      <DialogFooter className="gap-2"><Button variant="outline" className="min-h-11" disabled={inCorso} onClick={onClose}>Annulla</Button><Button className="min-h-11" disabled={inCorso} onClick={async () => {
        if (occupato.current) return;
        occupato.current = true; setInCorso(true); setErrore('');
        try {
          await riapriOrdineGamma(ordine.id, motivo);
          await Promise.all([qc.invalidateQueries({ queryKey: ['preventivo', ordine.id] }), qc.invalidateQueries({ queryKey: ['preventivi'] }), qc.invalidateQueries({ queryKey: ['gamma'] }), qc.invalidateQueries({ queryKey: ['file-gamma-prova', ordine.id] })]);
          toast.success('Ordine riaperto: disponibile in Da esportare.'); onClose();
        } catch (e) { setErrore(e instanceof Error ? e.message : 'Impossibile riaprire l’ordine.'); }
        finally { occupato.current = false; setInCorso(false); }
      }}>{inCorso ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}Riapri per reimportare</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
