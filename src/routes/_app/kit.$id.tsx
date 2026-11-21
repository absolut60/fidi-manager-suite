import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '@/components/back-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { BadgeLinea } from '@/components/preventivatore/BadgeLinea';
import { RigaKitDialog } from '@/components/kit/RigaKitDialog';
import { AiutoCalcolaDallaRiga } from '@/components/kit/AiutoCalcolaDallaRiga';
import { formatoQuantitaKit } from '@/components/kit/CampiCalcoloKit';
import { CAMPI_SEMPLICI_KIT, prossimoOrdineKit } from '@/lib/kit-semplice-ui';
import { SpecificheKitFields } from '@/components/kit/SpecificheKitFields';
import { ComponenteKit, type ComponenteKitVista } from '@/components/kit/ComponenteKit';
import { useAuth } from '@/hooks/use-auth';
import { useLineeUtente } from '@/lib/use-linee-utente';
import { puoGestireAnagrafichePreventivi } from '@/lib/permessi-preventivi';
import { lineaPreventivo } from '@/lib/linee-preventivo';
import { lineeKitAbilitate, specificheKitDaValori, valoriSpecificheKit } from '@/lib/kit-config';
import { deleteComponente, deleteKit, duplicateKit, fetchKit, fetchKitFamiglie, insertComponente, updateComponente, updateKit, type KitConComponenti, type KitComponenteUpdate, type KitUpdate, type KitFamiglia } from '@/lib/kit-api';
import { messaggioEsitoEliminazione } from '@/lib/esito-eliminazione';
import type { KitParametro } from '@/lib/kit-regole-ui';
import { calcolaKitRegole, totalePesoKit } from '@/lib/kit-regole';
import { fetchKitParametri } from '@/lib/kit-api';

export const Route=createFileRoute('/_app/kit/$id')({
  head:()=>({meta:[{title:'Editor kit — FidiManager'},{name:'description',content:'Dati e componenti del kit: catalogo Gamma, articoli manuali e incidenze.'},{property:'og:title',content:'Editor kit — FidiManager'},{property:'og:description',content:'Dati e componenti del kit: catalogo Gamma, articoli manuali e incidenze.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:KitEditorPage,
});
function KitEditorPage(){
  const {id}=Route.useParams();const {user,roles}=useAuth();const qc=useQueryClient();const navigate=useNavigate();
  const profilo=useLineeUtente(user?.id);
  const kit=useQuery({queryKey:['kit-v2',id],queryFn:()=>fetchKit(id)});
  const famiglie=useQuery({queryKey:['kit-famiglie'],queryFn:fetchKitFamiglie});
  const parametri=useQuery({queryKey:['kit-parametri',id],queryFn:()=>fetchKitParametri(id)});
  const modificabile=puoGestireAnagrafichePreventivi(roles)&&lineeKitAbilitate(profilo.data?.linee_abilitate).some(l=>l.codice===kit.data?.linea);
  const verifica=()=>{if(!modificabile)throw new Error('Kit in sola lettura: linea non abilitata alla gestione');};
  const invalidate=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['kit-v2',id]}),qc.invalidateQueries({queryKey:['kit-lista-v2']}),qc.invalidateQueries({queryKey:['kit-codici']}),qc.invalidateQueries({queryKey:['kit-parametri',id]})]);};
  const save=useMutation({scope:{id:`kit:${id}`},mutationFn:async(p:KitUpdate)=>{verifica();return updateKit(id,p);},onSuccess:invalidate,onError:(e:Error)=>toast.error(e.message)});
  const upd=useMutation({scope:{id:`componenti-kit:${id}`},mutationFn:async({rowId,patch}:{rowId:string;patch:KitComponenteUpdate})=>{verifica();return updateComponente(rowId,patch);},onSuccess:invalidate,onError:(e:Error)=>toast.error(e.message)});
  const ordineNuovo=()=>prossimoOrdineKit(kit.data?.componenti??[]);
  const add=useMutation({mutationFn:async(p:KitComponenteUpdate)=>{verifica();return insertComponente({...p,kit_id:id,ordine:ordineNuovo()});},onSuccess:invalidate,onError:(e:Error)=>toast.error(e.message)});
  const del=useMutation({mutationFn:async(rowId:string)=>{verifica();return deleteComponente(rowId);},onSuccess:async esito=>{if(esito.tipo !== "eliminato")toast.error(messaggioEsitoEliminazione(esito,'il componente'));await invalidate();},onError:(e:Error)=>toast.error(e.message)});
  const dup=useMutation({mutationFn:async()=>{verifica();return duplicateKit(id);},onSuccess:async k=>{await invalidate();toast.success('Kit duplicato');await navigate({to:'/kit/$id',params:{id:k.id}});},onError:(e:Error)=>toast.error(e.message)});
  const remove=useMutation({mutationFn:async()=>{verifica();return deleteKit(id);},onSuccess:async esito=>{if(esito.tipo !== "eliminato"){toast.error(messaggioEsitoEliminazione(esito,'il kit'));await invalidate();return;}await invalidate();toast.success('Kit eliminato');await navigate({to:'/kit'});},onError:(e:Error)=>toast.error(e.message)});
  if(kit.isError||famiglie.isError||profilo.isError||parametri.isError)return <p role="alert" className="p-4 text-destructive">Caricamento del kit non riuscito.</p>;
  if(!kit.data||!famiglie.data||!parametri.data||profilo.isPending)return <p role="status" className="p-4">Caricamento…</p>;
  return <KitEditorView key={kit.data.id} kit={kit.data} famiglie={famiglie.data} modificabile={modificabile} busy={add.isPending||dup.isPending||remove.isPending}
    onSave={async p=>{await save.mutateAsync(p);}} onPatch={async(rowId,patch)=>{await upd.mutateAsync({rowId,patch});}}
    parametri={parametri.data} onAdd={async p=>{await add.mutateAsync(p);}} onDuplicate={()=>dup.mutate()} onDelete={()=>remove.mutate()} onDeleteRow={rowId=>del.mutate(rowId)}/>;
}

export function KitEditorView({kit,famiglie,modificabile,busy=false,onSave,onPatch,onAdd,onDuplicate,onDelete,onDeleteRow,parametri=[]}:{
  kit:KitConComponenti;famiglie:KitFamiglia[];modificabile:boolean;busy?:boolean;
  onSave:(p:KitUpdate)=>Promise<void>;onPatch:(id:string,p:KitComponenteUpdate)=>Promise<void>;
  onAdd:(p:KitComponenteUpdate)=>Promise<void>;onDuplicate:()=>void;onDelete:()=>void;onDeleteRow:(id:string)=>void;
  parametri?:readonly KitParametro[];

}){
  const linea=lineaPreventivo(kit.linea);const config=linea.kit;
  const [specifiche,setSpecifiche]=useState(()=>valoriSpecificheKit(kit.specifiche));
  const [dialog,setDialog]=useState<{row:ComponenteKitVista|null}|null>(null);
  const [errore,setErrore]=useState('');
  const [bozze,setBozze]=useState<Record<string,KitComponenteUpdate>>({});
  const componenti=kit.componenti.map(c=>({...c,...bozze[c.id]}));
  const anteprima=calcolaKitRegole({componenti,parametri});
  const totale=totalePesoKit(componenti,anteprima);
  const campi=config.calcoloSemplice==='completo'?CAMPI_SEMPLICI_KIT:CAMPI_SEMPLICI_KIT.filter(c=>c.codice==='n_pezzi');
  const testoTotale=<div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"><strong>Peso totale: {formatoQuantitaKit(totale.pesoTotale)} kg/{kit.um_base}</strong>{totale.righeSenzaPeso>0&&<span className="text-muted-foreground">{totale.righeSenzaPeso} righe senza peso</span>}{totale.righeConErrore>0&&<span className="text-destructive">Totale parziale: {totale.righeConErrore} righe in errore</span>}</div>;
  const righeMenu=componenti.map(c=>({ordine:c.ordine,descrizione:c.articolo?.descrizione??c.descrizione??c.articolo_codice??c.codice_articolo_fornitore??'Articolo da definire'}));
  const famigliaLinea=famiglie.filter(f=>f.linea===kit.linea&&(f.attiva||f.id===kit.famiglia_id));
  const salva=async(p:KitUpdate)=>{try{setErrore('');await onSave(p);}catch(e){setErrore(e instanceof Error?e.message:'Salvataggio non riuscito');}};
  const salvaSpecifiche=()=>{try{void salva({specifiche:specificheKitDaValori(kit.linea,specifiche,kit.specifiche)});}catch(e){setErrore(e instanceof Error?e.message:'Specifiche non valide');}};
  const props=(c:ComponenteKitVista)=>({row:c,linea:kit.linea,um:kit.um_base,modificabile,righe:righeMenu,anteprima:anteprima.find(r=>r.ordine===c.ordine),
    onChange:(p:KitComponenteUpdate)=>setBozze(s=>({...s,[c.id]:{...s[c.id],...p}})),
    onPatch:async(p:KitComponenteUpdate)=>{try{await onPatch(c.id,p);setErrore('');}catch(e){setErrore(e instanceof Error?e.message:'Salvataggio non riuscito');throw e;}finally{setBozze(s=>{const resto={...s[c.id]};for(const campo of Object.keys(p))Reflect.deleteProperty(resto,campo);return{...s,[c.id]:resto};});}},
    onDelete:()=>onDeleteRow(c.id),onEdit:()=>setDialog({row:kit.componenti.find(r=>r.id===c.id)??c}),
  });
  return <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-4 p-3 md:p-4 lg:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 items-start gap-2"><BackButton fallbackTo="/kit" fallbackLabel="Kit"/><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-all font-mono text-xs text-muted-foreground">{kit.codice}</span><BadgeLinea linea={kit.linea}/></div><h1 className="break-words text-xl font-semibold">{kit.nome}</h1></div></div>{modificabile&&<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="min-h-10" onClick={onDuplicate} disabled={busy}><Copy className="h-4 w-4"/>Duplica</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label="Elimina kit" title="Elimina kit" disabled={busy}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare il kit?</AlertDialogTitle><AlertDialogDescription>Verranno eliminati anche i componenti collegati. Operazione irreversibile.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={e=>{e.preventDefault();onDelete();}}>Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}</header>
    {!modificabile&&<p className="text-sm text-muted-foreground">Sola lettura</p>}
    <Card className={`min-w-0 border-l-4 ${linea.classiBordo}`}><CardContent className="p-3 sm:p-4"><fieldset disabled={!modificabile} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="kit-codice">Codice *</Label><Input id="kit-codice" className="min-h-11 font-mono" key={kit.codice} defaultValue={kit.codice} onBlur={e=>{if(e.target.value.trim()!==kit.codice)void salva({codice:e.target.value.trim()});}}/></div>
      <div className="grid min-w-0 gap-1.5 sm:col-span-2"><Label htmlFor="kit-nome">Nome *</Label><Input id="kit-nome" className="min-h-11" key={kit.nome} defaultValue={kit.nome} onBlur={e=>{if(!e.target.value.trim()){setErrore('Il nome è obbligatorio');return;}if(e.target.value.trim()!==kit.nome)void salva({nome:e.target.value.trim()});}}/></div>
      <div className="grid min-w-0 gap-1.5"><Label>Linea</Label><p className="flex min-h-11 items-center text-sm">{linea.etichetta}</p></div>
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="kit-famiglia">Famiglia</Label><Select value={kit.famiglia_id??''} disabled={!modificabile} onValueChange={v=>void salva({famiglia_id:v})}><SelectTrigger id="kit-famiglia" className="min-h-11"><SelectValue placeholder="Scegli famiglia"/></SelectTrigger><SelectContent>{famigliaLinea.map(f=><SelectItem key={f.id} value={f.id} disabled={!f.attiva}>{f.nome}{!f.attiva?' (non attiva)':''}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="kit-um">Unità base *</Label><Input id="kit-um" className="min-h-11" key={kit.um_base} defaultValue={kit.um_base} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==kit.um_base)void salva({um_base:e.target.value.trim()});}}/></div>
      <SpecificheKitFields campi={config.specifiche} valori={specifiche} onChange={(k,v)=>setSpecifiche(s=>({...s,[k]:v}))} onCommit={salvaSpecifiche}/>
      <div className="grid min-w-0 gap-1.5 sm:col-span-2 xl:col-span-3"><Label htmlFor="kit-descrizione">Descrizione tecnica</Label><Textarea id="kit-descrizione" rows={2} key={kit.descrizione_tecnica} defaultValue={kit.descrizione_tecnica??''} onBlur={e=>{if((e.target.value.trim()||null)!==kit.descrizione_tecnica)void salva({descrizione_tecnica:e.target.value.trim()||null});}}/></div>
    </fieldset>{errore&&<p role="alert" className="mt-3 text-sm text-destructive">{errore}</p>}</CardContent></Card>

    <section className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><h2 className="text-base font-semibold">Componenti <span className="text-sm font-normal text-muted-foreground">({kit.componenti.length})</span></h2>{modificabile&&<Button size="sm" className="min-h-10" onClick={()=>setDialog({row:null})} disabled={busy}><Plus className="h-4 w-4"/>Aggiungi riga</Button>}</div>
      {componenti.length===0?<p className="py-6 text-sm text-muted-foreground">Nessun componente.</p>:<><div className="space-y-3 lg:hidden">{componenti.map(c=><ComponenteKit key={c.id} {...props(c)} mobile/>)}<div className="border-t py-3">{testoTotale}</div></div>
      <div className={`hidden min-w-0 rounded-md border border-l-4 bg-card lg:block ${linea.classiBordo}`}><Table className="w-full table-fixed"><TableHeader><TableRow className="text-xs"><TableHead className="w-12 break-words px-1 text-xs">Ordine</TableHead><TableHead className="w-[20%] px-2 text-xs">Articolo</TableHead>
      {campi.map(c=><TableHead className={`${c.codice==='consumo'||c.codice==='riga_rif'?'w-[8%]':''} break-words px-0.5 text-xs`} title={c.codice==='riga_rif'?undefined:c.aiuto} key={c.codice}>{c.codice==='riga_rif'?<div className="flex flex-wrap items-center">{c.etichetta}<AiutoCalcolaDallaRiga/></div>:c.codice==='n_pezzi'&&config.calcoloSemplice==='solo_quantita'?'Quantità per kit':c.etichetta}</TableHead>)}
      <TableHead className="w-[9%] break-words px-1 text-xs">Incidenza</TableHead><TableHead className="break-words px-0.5 text-xs">Peso unit. (kg)</TableHead><TableHead className="w-[9%] break-words px-1 text-xs">Peso/{kit.um_base} (kg)</TableHead><TableHead className="w-11 px-0.5"><span className="sr-only">Azioni</span></TableHead></TableRow></TableHeader>
      <TableBody>{componenti.map(c=><ComponenteKit key={c.id} {...props(c)}/>)}</TableBody><TableFooter><TableRow><TableCell colSpan={campi.length+6} className="p-3">{testoTotale}</TableCell></TableRow></TableFooter></Table></div></>}
    </section>
    {dialog&&modificabile&&<RigaKitDialog kit={kit} row={dialog.row} parametri={parametri} onClose={()=>setDialog(null)} onSave={async p=>{if(dialog.row)await onPatch(dialog.row.id,p);else await onAdd(p);}}/>}

  </div>;
}
