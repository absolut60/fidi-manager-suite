import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { caricaDatiEsportazioneGamma } from '@/lib/esportazione-gamma-dati';
import { costruisciEsportazioneGamma, type DatiOrdineGamma } from '@/lib/esportazione-gamma';
import { salvaFile } from '@/lib/salva-file';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RiquadroAnagrafica } from '@/components/ui/riquadro-anagrafica';
import { toast } from 'sonner';
import { ProblemiGamma } from './ProblemiGamma';

type EsitoGamma = ReturnType<typeof costruisciEsportazioneGamma>;
export interface ProvaGammaPronta {
  dati: DatiOrdineGamma[];
  esito: EsitoGamma;
  file: { blob: Blob; nome: string } | null;
}

/** File preparato prima del clic: il download mantiene l'attivazione anche su iOS. */
export function FileGammaDiProvaContenuto({ pronta, onClose }: { pronta: ProvaGammaPronta; onClose: () => void }) {
  const { esito, dati, file } = pronta;
  const bloccanti = esito.problemi.filter(p => p.livello === 'bloccante');
  const avvisi = esito.problemi.filter(p => p.livello === 'avviso');
  const pronto = bloccanti.length === 0 && esito.ordiniEsportati.length > 0;
  return <>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
      <RiquadroAnagrafica tono={pronto ? 'verde' : 'neutro'} className={pronto ? '' : 'border-l-destructive'}>
        <div role="status" className={`flex items-center gap-2 font-semibold ${pronto ? 'text-pv-verde' : 'text-destructive'}`}>
          {pronto ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
          <span>{pronto ? 'Pronto per Gamma' : 'Non esportabile'}</span>
        </div>
      </RiquadroAnagrafica>
      {([{ problemi: bloccanti, titolo: 'Da completare', tono: 'neutro', classi: 'border-l-destructive', testo: 'text-destructive' },
        { problemi: avvisi, titolo: 'Da verificare', tono: 'arancio', classi: '', testo: 'text-pv-arancio' }] as const).map(gruppo => gruppo.problemi.length > 0 &&
        <RiquadroAnagrafica key={gruppo.titolo} tono={gruppo.tono} className={gruppo.classi}>
          <h3 className={`text-sm font-semibold ${gruppo.testo}`}>{gruppo.titolo} · {gruppo.problemi.length}</h3>
          <div className="mt-2"><ProblemiGamma problemi={gruppo.problemi} dati={dati} /></div>
        </RiquadroAnagrafica>)}
    </div>
    <p className="shrink-0 text-xs text-muted-foreground">File di prova: l'ordine non viene segnato come esportato.</p>
    <DialogFooter className="shrink-0 gap-2 sm:gap-2">
      <Button variant="outline" className="min-h-11" onClick={onClose}>Chiudi</Button>
      {pronto && file && <Button className="min-h-11" onClick={() => {
        void salvaFile(file.blob, file.nome).catch(() => toast.error('Impossibile scaricare il file. Riprova.'));
      }}><Download className="mr-2 size-4" />Scarica file .xls</Button>}
    </DialogFooter>
  </>;
}

export function FileGammaDiProvaDialog({ ordineId, open, onOpenChange }: {
  ordineId: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { hasRole } = useAuth();
  const amministratore = hasRole('amministratore');
  const query = useQuery({
    queryKey: ['file-gamma-prova', ordineId], enabled: open && amministratore, staleTime: 0, gcTime: 0,
    queryFn: async (): Promise<ProvaGammaPronta> => {
      const dati = await caricaDatiEsportazioneGamma([ordineId]);
      const esito = costruisciEsportazioneGamma(dati);
      let file: ProvaGammaPronta['file'] = null;
      if (esito.ordiniBloccati.length === 0 && esito.ordiniEsportati.length > 0) {
        const { scriviFileGammaXls, nomeFileGamma } = await import('@/lib/esportazione-gamma-file');
        const bytes = scriviFileGammaXls(esito.righe);
        file = { blob: new Blob([new Uint8Array(bytes)], { type: 'application/vnd.ms-excel' }), nome: nomeFileGamma(new Date()) };
      }
      return { dati, esito, file };
    },
  });
  if (!amministratore) return null;
  return <FileGammaDiProvaVista open={open} onOpenChange={onOpenChange} pronta={query.data}
    inCorso={query.isPending} errore={!!query.error} onRiprova={() => void query.refetch()} />;
}

/** Presentazione separata dalle letture, verificabile senza una sessione o dati reali. */
export function FileGammaDiProvaVista({ open, onOpenChange, pronta, inCorso = false, errore = false, onRiprova }: {
  open: boolean; onOpenChange: (v: boolean) => void; pronta?: ProvaGammaPronta;
  inCorso?: boolean; errore?: boolean; onRiprova?: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none p-3 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-lg sm:p-5">
      <DialogHeader className="shrink-0 pr-8 text-left">
        <DialogTitle className="break-words">File Gamma di prova</DialogTitle>
        <DialogDescription>Controllo dell'ordine prima del download.</DialogDescription>
      </DialogHeader>
      {inCorso ? <div role="status" className="flex min-h-24 items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Preparazione del file…</div>
        : errore ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">Impossibile preparare il file Gamma. Riprova.</p><Button variant="outline" className="min-h-11" onClick={onRiprova}><RefreshCw className="mr-2 size-4" />Riprova</Button></div>
        : pronta && <FileGammaDiProvaContenuto pronta={pronta} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>;
}