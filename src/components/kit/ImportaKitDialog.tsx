import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScegliFile } from '@/components/ui/scegli-file';
import { analizzaImportKit, codiciArticoloFile, leggiWorkbookKit, type AnteprimaKit, type FamigliaExcel } from '@/lib/kit-excel';
import { codiciGammaEsistenti, kitEsistentiPerCodice, salvaKitImportati, type EsitoImportKit } from '@/lib/kit-api';
import type { LineaPreventivo } from '@/lib/linee-preventivo';

export function ImportaKitDialog({ open, onOpenChange, lineeAbilitate, famiglie }: {
  open: boolean; onOpenChange: (v: boolean) => void; lineeAbilitate: readonly LineaPreventivo[]; famiglie: readonly FamigliaExcel[];
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState<string>();
  const [lettura, setLettura] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [erroriFile, setErroriFile] = useState<string[]>([]);
  const [avvisiFile, setAvvisiFile] = useState<string[]>([]);
  const [anteprime, setAnteprime] = useState<AnteprimaKit[]>([]);
  const [esiti, setEsiti] = useState<EsitoImportKit[] | null>(null);
  const reset = () => { setNome(undefined); setErroriFile([]); setAvvisiFile([]); setAnteprime([]); setEsiti(null); };

  async function scegli(file: File) {
    reset(); setNome(file.name); setLettura(true);
    try {
      const letto = leggiWorkbookKit(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      setErroriFile(letto.erroriFile); setAvvisiFile(letto.avvisiFile);
      if (letto.erroriFile.length) return;
      const codiciKit = [...new Set(letto.righe.map(r => String(r.valori.codice ?? '').trim()).filter(Boolean))];
      const [codiciGamma, esistenti] = await Promise.all([codiciGammaEsistenti(codiciArticoloFile(letto)), kitEsistentiPerCodice(codiciKit)]);
      setAnteprime(analizzaImportKit(letto, { lineeAbilitate, famiglie, codiciGamma, esistenti }));
    } catch (e) {
      setErroriFile([`File non leggibile: ${e instanceof Error ? e.message : 'formato non valido'}.`]);
    } finally { setLettura(false); }
  }
  const validi = anteprime.filter(a => a.payload);
  async function conferma() {
    setSalvataggio(true);
    try {
      const r = await salvaKitImportati(validi.map(a => a.payload!));
      setEsiti(r);
      qc.invalidateQueries({ queryKey: ['kit-lista-v2'] }); qc.invalidateQueries({ queryKey: ['kit-codici'] }); qc.invalidateQueries({ queryKey: ['kit'] });
      const creati = r.filter(e => e.esito === 'creato').length, aggiornati = r.filter(e => e.esito === 'aggiornato').length;
      toast.success(`Import concluso: ${creati} creati, ${aggiornati} aggiornati, ${anteprime.length - creati - aggiornati} esclusi.`);
    } finally { setSalvataggio(false); }
  }
  const creati = esiti?.filter(e => e.esito === 'creato').length ?? 0;
  const aggiornati = esiti?.filter(e => e.esito === 'aggiornato').length ?? 0;

  return <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
      <DialogHeader><DialogTitle>Importa kit da Excel</DialogTitle>
        <DialogDescription>Usa il modello scaricato da questa pagina. Prima di salvare vedi l’anteprima di ogni kit.</DialogDescription></DialogHeader>
      <ScegliFile accept=".xlsx,.xls" onFiles={f => f[0] && scegli(f[0])} nomi={nome ? [nome] : []} etichetta="Scegli file Excel" disabled={lettura || salvataggio} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {lettura && <p role="status" className="text-sm text-muted-foreground">Lettura del file…</p>}
        {erroriFile.map(e => <p key={e} role="alert" className="text-sm text-destructive">{e}</p>)}
        {avvisiFile.map(e => <p key={e} className="text-sm text-muted-foreground">{e}</p>)}
        {esiti && <div className="rounded-md border-l-4 border-l-primary bg-card p-3 text-sm" role="status">
          <p className="font-medium">{creati} kit creati, {aggiornati} aggiornati, {anteprime.length - creati - aggiornati} esclusi.</p>
          {esiti.filter(e => e.esito === 'fallito').map(e => <p key={e.codice} className="text-destructive">{e.codice}: non salvato — {e.messaggio}</p>)}
        </div>}
        {anteprime.map(a => {
          const esito = esiti?.find(e => e.codice === a.codice);
          return <div key={a.codice} className={`min-w-0 rounded-md border border-l-4 bg-card p-3 ${a.errori.length ? 'border-l-destructive' : 'border-l-primary'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="break-all font-mono text-xs text-muted-foreground">{a.codice}</p><p className="break-words font-medium">{a.nome}</p></div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {a.errori.length ? <Badge variant="destructive">Escluso</Badge> : a.stato === 'nuovo' ? <Badge>Nuovo</Badge> : <Badge variant="secondary">Aggiorna (sostituisce {a.righeSostituite} righe)</Badge>}
                {esito && <Badge variant={esito.esito === 'fallito' ? 'destructive' : 'outline'}>{esito.esito === 'creato' ? 'Creato' : esito.esito === 'aggiornato' ? 'Aggiornato' : 'Non salvato'}</Badge>}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{a.nRighe} righe · {a.nManuali} manuali · {a.avvisi.length} avvisi · {a.errori.length} errori</p>
            {a.errori.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-destructive">{a.errori.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>}
            {a.avvisi.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{a.avvisi.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>}
          </div>;
        })}
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" className="min-h-10" onClick={() => onOpenChange(false)}>{esiti ? 'Chiudi' : 'Annulla'}</Button>
        {!esiti && <Button className="min-h-10" disabled={!validi.length || salvataggio || lettura} onClick={conferma}>{salvataggio ? 'Salvataggio…' : `Conferma import (${validi.length})`}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
