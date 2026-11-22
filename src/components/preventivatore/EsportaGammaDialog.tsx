import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { caricaDatiEsportazioneGamma } from '@/lib/esportazione-gamma-dati';
import { costruisciEsportazioneGamma, puoEsportareGamma, type DatiOrdineGamma } from '@/lib/esportazione-gamma';
import { completaDatiGamma, datiNuovoClienteGamma, esportaOrdiniGamma } from '@/lib/esportazione-gamma-operazioni';
import { opzioniCataloghiRiferimento, type CataloghiRiferimento } from '@/lib/condizioni-riferimento';
import { salvaFile } from '@/lib/salva-file';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RiquadroAnagrafica } from '@/components/ui/riquadro-anagrafica';
import { CampoCodiceSdi } from '@/components/lead/campo-codice-sdi';
import { ProblemiGamma } from './ProblemiGamma';

function DatiLeadGamma({ dati, cataloghi, disabled, onSave }: {
  dati: DatiOrdineGamma; cataloghi?: CataloghiRiferimento | undefined; disabled: boolean;
  onSave: (id: string, valori: ReturnType<typeof datiNuovoClienteGamma>) => Promise<void>;
}) {
  const [valori, setValori] = useState(() => datiNuovoClienteGamma(dati));
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');
  const selettore = (campo: 'listino_rif' | 'macrocategoria_rif' | 'categoria_rif', label: string, opzioni: { valore: string; label: string }[]) =>
    <div className="grid min-w-0 gap-1.5"><Label className="text-xs">{label}</Label>
      <Select value={String(valori[campo] ?? '__none__')} disabled={disabled || salvando || !cataloghi} onValueChange={v => setValori(p => ({ ...p, [campo]: v === '__none__' ? null : campo === 'listino_rif' ? Number(v) : v }))}>
        <SelectTrigger aria-label={label} className="min-h-11 w-full min-w-0 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Scegli" /></SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">—</SelectItem>{opzioni.map(o => <SelectItem key={o.valore} value={o.valore} className="break-words whitespace-normal">{o.label}</SelectItem>)}</SelectContent>
      </Select></div>;
  return <fieldset disabled={disabled || salvando} className="mt-3 min-w-0 space-y-3 border-t pt-3">
    <legend className="pt-3 text-sm font-semibold">Dati per il nuovo cliente Gamma</legend>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {selettore('listino_rif', 'Listino', cataloghi?.listini.map(c => ({ valore: String(c.codice), label: `${c.codice} — ${c.descrizione}` })) ?? [])}
      {selettore('macrocategoria_rif', 'Macro categoria', cataloghi?.macrocategorie.map(c => ({ valore: c.codice, label: c.label })) ?? [])}
      {selettore('categoria_rif', 'Categoria', cataloghi?.categorie.map(c => ({ valore: c.codice, label: c.label })) ?? [])}
      <CampoCodiceSdi value={valori.codice_sdi} onChange={v => setValori(p => ({ ...p, codice_sdi: v }))} />
    </div>
    {errore && <p role="alert" className="break-words text-sm text-destructive">{errore}</p>}
    <Button variant="outline" className="min-h-11" disabled={disabled || salvando || !cataloghi} onClick={async () => {
      setSalvando(true); setErrore('');
      try { await onSave(dati.ordine.id, valori); } catch (e) { setErrore(e instanceof Error ? e.message : 'Dati non salvati.'); }
      finally { setSalvando(false); }
    }}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salva dati</Button>
  </fieldset>;
}

export function EsportaGammaContenuto({ dati, cataloghi, erroreCataloghi, inCorso, onSave, onExport, onClose }: {
  dati: DatiOrdineGamma[]; cataloghi?: CataloghiRiferimento | undefined; erroreCataloghi?: boolean;
  inCorso: boolean; onSave: (id: string, valori: ReturnType<typeof datiNuovoClienteGamma>) => Promise<void>;
  onExport: () => void; onClose: () => void;
}) {
  const esito = useMemo(() => costruisciEsportazioneGamma(dati), [dati]);
  const testate = esito.righe.filter(r => r.TESTATA_RIGHE === 'T');
  const [salvataggi, setSalvataggi] = useState(0);
  const occupato = inCorso || salvataggi > 0;
  return <>
    <p role="status" className="shrink-0 break-words text-sm font-medium">{esito.ordiniEsportati.length} ordini pronti · {esito.ordiniBloccati.length} non esportabili · {testate.filter(r => Number(r.IND_CLIFOR) === 1).length} ordini fornitore · {testate.filter(r => Number(r.IND_CLIFOR) === 0).length} ordini cliente</p>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
      {erroreCataloghi && <p role="alert" className="text-sm text-destructive">Impossibile leggere listini e categorie. Riprova la preparazione.</p>}
      {dati.map(d => {
        const pronto = esito.ordiniEsportati.includes(d.ordine.id);
        return <RiquadroAnagrafica key={d.ordine.id} tono={pronto ? 'verde' : 'neutro'} className={pronto ? '' : 'border-l-destructive'}>
          <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{d.ordine.numero}</h3><p className="break-words text-sm">{d.cliente?.ragione_sociale || d.lead?.ragione_sociale || [d.lead?.nome, d.lead?.cognome].filter(Boolean).join(' ') || 'Destinatario non disponibile'}</p></div>
            <Badge variant={pronto ? 'outline' : 'destructive'} className={pronto ? 'text-pv-verde' : ''}>{pronto ? 'Pronto' : 'Non esportabile'}</Badge>
          </div>
          <ProblemiGamma problemi={esito.problemi.filter(p => p.ordineId === d.ordine.id)} dati={[d]} />
          {d.ordine.lead_id && d.lead && <DatiLeadGamma dati={d} cataloghi={cataloghi} disabled={occupato} onSave={async (id, valori) => {
            setSalvataggi(n => n + 1);
            try { await onSave(id, valori); } finally { setSalvataggi(n => n - 1); }
          }} />}
        </RiquadroAnagrafica>;
      })}
    </div>
    {esito.ordiniBloccati.length > 0 && <p className="shrink-0 break-words text-xs text-destructive">Restano in Da esportare: {dati.filter(d => esito.ordiniBloccati.includes(d.ordine.id)).map(d => d.ordine.numero).join(', ')}.</p>}
    <DialogFooter className="shrink-0 gap-2 sm:gap-2">
      <Button variant="outline" className="min-h-11" disabled={occupato} onClick={onClose}>Chiudi</Button>
      <Button className="min-h-11 whitespace-normal" disabled={occupato || !esito.ordiniEsportati.length} onClick={onExport}>{inCorso ? <Loader2 className="mr-2 size-4 shrink-0 animate-spin" /> : <Download className="mr-2 size-4 shrink-0" />}Genera file ed esporta ({esito.ordiniEsportati.length})</Button>
    </DialogFooter>
  </>;
}

export function EsportaGammaDialog({ ids, open, onOpenChange, onSuccess }: {
  ids: string[]; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void;
}) {
  const { hasRole } = useAuth();
  const ammesso = puoEsportareGamma(hasRole);
  const busy = useRef(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const query = useQuery({ queryKey: ['gamma-esportazione', ids], enabled: open && ammesso, staleTime: 0, gcTime: 0,
    queryFn: () => caricaDatiEsportazioneGamma(ids) });
  const cataloghi = useQuery({ ...opzioniCataloghiRiferimento, enabled: open && ammesso });
  if (!ammesso) return null;
  return <Dialog open={open} onOpenChange={v => { if (!busy.current) { setErrore(''); onOpenChange(v); } }}>
    <DialogContent onInteractOutside={e => e.preventDefault()} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none p-3 sm:h-[min(90dvh,60rem)] sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-lg sm:p-5">
      <DialogHeader className="shrink-0 pr-8 text-left"><DialogTitle className="break-words">Esporta in Gamma</DialogTitle><DialogDescription>Ordini selezionati: {ids.length}</DialogDescription></DialogHeader>
      {errore && <p role="alert" className="shrink-0 break-words text-sm text-destructive">{errore}</p>}
      {query.isPending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Preparazione…</p>
        : query.error ? <div role="alert"><p className="break-words text-sm text-destructive">{query.error.message}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void query.refetch()}><RefreshCw className="mr-2 size-4" />Riprova</Button></div>
        : query.data && <EsportaGammaContenuto dati={query.data} cataloghi={cataloghi.data} erroreCataloghi={cataloghi.isError} inCorso={inCorso || query.isFetching}
          onClose={() => onOpenChange(false)} onSave={async (id, valori) => { await completaDatiGamma(id, valori); const r = await query.refetch(); if (r.error) throw r.error; }}
          onExport={() => { if (busy.current) return; busy.current = true; setInCorso(true); setErrore('');
            void (async () => {
              try {
                const risultato = await esportaOrdiniGamma(ids);
                try { await salvaFile(risultato.blob, risultato.nome); } catch { toast.error('Ordini esportati, ma il download non è riuscito. Il file resta conservato nello storico.'); }
                onOpenChange(false); onSuccess(); toast.success(`${risultato.esito.ordiniEsportati.length} ordini esportati in Gamma`);
              } catch (e) { setErrore(e instanceof Error ? e.message : 'Esportazione non riuscita.'); }
              finally { busy.current = false; setInCorso(false); }
            })();
          }} />}
    </DialogContent>
  </Dialog>;
}