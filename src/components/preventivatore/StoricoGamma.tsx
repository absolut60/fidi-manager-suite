import { Fragment, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useFiltriPagina } from '@/hooks/use-filtri-pagina';
import { puoEsportareGamma } from '@/lib/esportazione-gamma';
import { dataOraGamma, fetchStoricoGamma, fetchEventiGamma, opzioniNomiGamma, nomeUtenteGamma, preparaDownloadGamma, type EventoGamma, type EsportazioneGamma, type PeriodoGamma } from '@/lib/esportazioni-gamma-storico';
import { salvaFile } from '@/lib/salva-file';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { ElencoSchede, SchedaLista } from '@/components/lista-responsive';
import { DataExportFiltro } from './DataExportFiltro';

function RigaEvento({ evento, nomi }: { evento: EventoGamma; nomi: Map<string, string> | undefined }) {
  return <li className="grid min-w-0 gap-1 border-b py-3 text-sm last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
    {evento.ordine_id ? <Link to="/preventivatore/$id" params={{ id: evento.ordine_id }} className="break-words font-mono font-semibold text-pv-blu hover:underline">{evento.numero_ordine ?? 'Ordine'}</Link> : <span>{evento.numero_ordine ?? 'Ordine'}</span>}
    <p className="min-w-0 break-words">{evento.tipo === 'riaperto' ? 'Riaperto' : 'Esportato'} il {dataOraGamma(evento.at ?? '')} da {nomeUtenteGamma(nomi, evento.utente)}{evento.motivo && <> — <span className="whitespace-pre-wrap">{evento.motivo}</span></>}</p>
  </li>;
}
function EventiEsportazione({ id, nomi }: { id: string; nomi: Map<string, string> | undefined }) {
  const query = useQuery({ queryKey: ['gamma', 'eventi', id], queryFn: () => fetchEventiGamma(id, { dal: '', al: '' }) });
  if (query.isPending) return <p role="status" className="py-3 text-sm">Caricamento eventi…</p>;
  if (query.error) return <p role="alert" className="py-3 text-sm text-destructive">Impossibile leggere gli eventi. <Button variant="link" onClick={() => void query.refetch()}>Riprova</Button></p>;
  return query.data.length ? <ul className="min-w-0">{query.data.map(e => <RigaEvento key={e.id} evento={e} nomi={nomi} />)}</ul> : <p className="py-3 text-sm text-muted-foreground">Nessun evento.</p>;
}
function ScaricaGamma({ file }: { file: EsportazioneGamma }) {
  const [occupato, setOccupato] = useState(false);
  return <Button variant="outline" className="min-h-10 shrink-0" disabled={occupato || !file.file_path} onClick={async e => {
    e.stopPropagation(); if (occupato) return; setOccupato(true);
    try { const pronto = await preparaDownloadGamma(file); await salvaFile(pronto.blob, pronto.nome); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Impossibile scaricare il file.'); }
    finally { setOccupato(false); }
  }}>{occupato ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}Scarica</Button>;
}
export function StoricoGamma() {
  const { hasRole } = useAuth();
  return puoEsportareGamma(hasRole) ? <StoricoGammaElenco /> : null;
}
function StoricoGammaElenco() {
  const { user } = useAuth();
  const { filtri, setCampo } = useFiltriPagina('storico-esportazioni-gamma', { dal: '', al: '' }, { userId: user?.id });
  const periodo: PeriodoGamma = { dal: filtri.dal, al: filtri.al };
  const { data: nomi } = useQuery(opzioniNomiGamma);
  const storico = useQuery({ queryKey: ['gamma', 'storico', periodo], queryFn: () => fetchStoricoGamma(periodo) });
  const riaperture = useQuery({ queryKey: ['gamma', 'riaperture', periodo], queryFn: () => fetchEventiGamma(null, periodo) });
  const [aperti, setAperti] = useState<string[]>([]);
  const toggle = (id: string) => setAperti(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const apri = (file: EsportazioneGamma) => <Button variant="ghost" className="min-h-10 max-w-full justify-start whitespace-normal break-words text-left" aria-expanded={aperti.includes(file.id)} aria-label={`Eventi ${file.nome_file ?? 'esportazione'}`} onClick={() => toggle(file.id)}>{aperti.includes(file.id) ? <ChevronDown className="mr-2 size-4 shrink-0" /> : <ChevronRight className="mr-2 size-4 shrink-0" />}<span className="min-w-0 break-all">{file.nome_file ?? 'File senza nome'}</span></Button>;
  const conta = (n: number | null) => (n ?? 0).toLocaleString('it-IT');
  return <section className="min-w-0 space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:max-w-lg sm:grid-cols-2"><DataExportFiltro label="Dal" value={filtri.dal} onChange={v => setCampo('dal', v)} /><DataExportFiltro label="Al" value={filtri.al} onChange={v => setCampo('al', v)} /></div>
    {storico.isPending ? <p role="status">Caricamento esportazioni…</p> : storico.error ? <p role="alert" className="text-sm text-destructive">Impossibile leggere lo storico. <Button variant="link" onClick={() => void storico.refetch()}>Riprova</Button></p> : storico.data.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna esportazione.</p> : <>
      <ElencoSchede finoA="lg">{storico.data.map(file => <SchedaLista key={file.id} titolo={apri(file)} colonneCampi={2} campi={[{ etichetta: 'Data e ora', valore: dataOraGamma(file.creata_at ?? '') }, { etichetta: 'Esportato da', valore: nomeUtenteGamma(nomi, file.creata_da) }, { etichetta: 'Ordini', valore: conta(file.n_ordini) }, { etichetta: 'Ordini fornitore', valore: conta(file.n_documenti_fornitore) }, { etichetta: 'Ordini cliente', valore: conta(file.n_documenti_cliente) }]} footer={<div className="w-full min-w-0"><ScaricaGamma file={file} />{aperti.includes(file.id) && <EventiEsportazione id={file.id} nomi={nomi} />}</div>} />)}</ElencoSchede>
      <div className="hidden rounded-md border bg-card lg:block"><Table className="table-fixed text-sm"><TableHeader><TableRow><TableHead className="w-40">Data e ora</TableHead><TableHead className="w-36">Chi</TableHead><TableHead>File</TableHead><TableHead className="w-16 text-right">Ordini</TableHead><TableHead className="w-24 text-right">Fornitore</TableHead><TableHead className="w-20 text-right">Cliente</TableHead><TableHead className="w-28"><span className="sr-only">Scarica</span></TableHead></TableRow></TableHeader><TableBody>{storico.data.map(file => <Fragment key={file.id}><TableRow><TableCell className="align-top">{dataOraGamma(file.creata_at ?? '')}</TableCell><TableCell className="break-words align-top">{nomeUtenteGamma(nomi, file.creata_da)}</TableCell><TableCell className="min-w-0 align-top">{apri(file)}</TableCell><TableCell className="text-right align-top">{conta(file.n_ordini)}</TableCell><TableCell className="text-right align-top">{conta(file.n_documenti_fornitore)}</TableCell><TableCell className="text-right align-top">{conta(file.n_documenti_cliente)}</TableCell><TableCell className="align-top"><ScaricaGamma file={file} /></TableCell></TableRow>{aperti.includes(file.id) && <TableRow><TableCell colSpan={7} className="bg-muted/30"><EventiEsportazione id={file.id} nomi={nomi} /></TableCell></TableRow>}</Fragment>)}</TableBody></Table></div>
    </>}
    <section className="min-w-0 border-t pt-4"><h2 className="text-base font-semibold">Riaperture</h2>{riaperture.isPending ? <p role="status" className="py-3 text-sm">Caricamento riaperture…</p> : riaperture.error ? <p role="alert" className="py-3 text-sm text-destructive">Impossibile leggere le riaperture. <Button variant="link" onClick={() => void riaperture.refetch()}>Riprova</Button></p> : riaperture.data.length ? <ul>{riaperture.data.map(e => <RigaEvento key={e.id} evento={e} nomi={nomi} />)}</ul> : <p className="py-3 text-sm text-muted-foreground">Nessuna riapertura.</p>}</section>
  </section>;
}
