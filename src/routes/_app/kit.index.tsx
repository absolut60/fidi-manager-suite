import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { puoGestireAnagrafichePreventivi } from '@/lib/permessi-preventivi';
import { Card, CardContent } from '@/components/ui/card';
import { FiltroMultiplo } from '@/components/filtro-multiplo';
import { BadgeLinea } from '@/components/preventivatore/BadgeLinea';
import { Plus, Copy, ArrowUpRight, Layers, Upload, Download, FileSpreadsheet, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ImportaKitDialog } from '@/components/kit/ImportaKitDialog';
import { costruisciWorkbookKit, KIT_ESEMPIO_SINTETICO, kitExcelDaKit } from '@/lib/kit-excel';
import { salvaWorkbook } from '@/lib/salva-workbook';
import { toast } from 'sonner';
import { duplicateKit, fetchKitsWithComponenti, fetchKitFamiglie, type KitConComponenti, type KitFamiglia } from '@/lib/kit-api';
import { lineeKitAbilitate } from '@/lib/kit-config';
import type { ConfigurazioneLineaPreventivo } from '@/lib/linee-preventivo';
import { useLineeUtente } from '@/lib/use-linee-utente';
import { useFiltriPagina } from '@/hooks/use-filtri-pagina';
import { NuovoKitDialog } from '@/components/kit/NuovoKitDialog';

export const Route=createFileRoute('/_app/kit/')({
  head:()=>({meta:[{title:'Kit e lavorazioni — FidiManager'},{name:'description',content:'Catalogo kit per linea e famiglia, con componenti Gamma e manuali.'},{property:'og:title',content:'Kit e lavorazioni — FidiManager'},{property:'og:description',content:'Catalogo kit per linea e famiglia, con componenti Gamma e manuali.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component:KitListPage,
});
function KitListPage(){
  const {user,roles}=useAuth();const qc=useQueryClient();const [open,setOpen]=useState(false);const [imp,setImp]=useState(false);
  const profilo=useLineeUtente(user?.id);
  const linee=lineeKitAbilitate(profilo.data?.linee_abilitate);
  const kit=useQuery({queryKey:['kit-lista-v2'],queryFn:fetchKitsWithComponenti});
  const famiglie=useQuery({queryKey:['kit-famiglie'],queryFn:fetchKitFamiglie});
  const {filtri,setCampo}=useFiltriPagina('kit',{linee:[] as string[]},{userId:user?.id,valida:{linee:Array.isArray}});
  const dup=useMutation({mutationFn:async(id:string)=>{
    const k=kit.data?.find(k=>k.id===id);
    if(!puoGestireAnagrafichePreventivi(roles)||!k||!linee.some(l=>l.codice===k.linea))throw new Error('Linea non abilitata alla gestione');
    return duplicateKit(id);
  },onSuccess:()=>{qc.invalidateQueries({queryKey:['kit-lista-v2']});qc.invalidateQueries({queryKey:['kit-codici']});toast.success('Kit duplicato');},onError:(e:Error)=>toast.error(e.message)});
  const fam=famiglie.data??[];
  const scarica=(kits:KitConComponenti[],nome:string,esempio=false)=>{
    const dati=kits.map(k=>kitExcelDaKit(k,fam));
    salvaWorkbook(costruisciWorkbookKit(esempio&&!dati.length?[KIT_ESEMPIO_SINTETICO]:dati,fam),nome).catch((e:Error)=>toast.error(e.message));
  };
  const oggi=new Date().toLocaleDateString('it-IT').split('/').reverse().join('-');
  return <><KitListView kits={kit.data??[]} famiglie={famiglie.data??[]} linee={linee} selezionate={filtri.linee} onFilter={v=>setCampo('linee',v)}
    gestisce={puoGestireAnagrafichePreventivi(roles)} onNew={()=>setOpen(true)} onDuplicate={id=>dup.mutate(id)} busy={dup.isPending}
    onImporta={()=>setImp(true)} onTemplate={()=>scarica((kit.data??[]).filter(k=>k.codice==='SM-PAR-2L-75-50'),'modello-kit.xlsx',true)} onEsporta={ks=>scarica(ks,`kit-${oggi}.xlsx`)}
    loading={kit.isPending||famiglie.isPending||profilo.isPending} error={kit.isError||famiglie.isError||profilo.isError}/><NuovoKitDialog open={open} onOpenChange={setOpen}/><ImportaKitDialog open={imp} onOpenChange={setImp} lineeAbilitate={linee.map(l=>l.codice)} famiglie={fam}/></>;
}
export function KitListView({kits,famiglie,linee,selezionate,onFilter,gestisce,onNew,onDuplicate,onImporta,onTemplate,onEsporta,busy=false,loading=false,error=false}:{
  kits:KitConComponenti[];famiglie:KitFamiglia[];linee:ConfigurazioneLineaPreventivo[];selezionate:string[];onFilter:(v:string[])=>void;
  gestisce:boolean;onNew:()=>void;onDuplicate:(id:string)=>void;onImporta?:()=>void;onTemplate?:()=>void;onEsporta?:(kits:KitConComponenti[])=>void;busy?:boolean;loading?:boolean;error?:boolean;
}){
  const selezioneValida=selezionate.filter(s=>linee.some(l=>l.codice===s));
  const visibili=linee.filter(l=>linee.length===1||!selezioneValida.length||selezioneValida.includes(l.codice));
  const presenti=kits.filter(k=>visibili.some(l=>l.codice===k.linea));
  return <div className="flex min-w-0 flex-col gap-5 p-3 md:p-4 lg:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Kit e lavorazioni</h1>{gestisce&&linee.length>0&&<div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 md:flex">
        <Button variant="outline" className="min-h-10" onClick={onImporta}><Upload className="h-4 w-4"/>Importa da Excel</Button>
        <Button variant="outline" className="min-h-10" onClick={onTemplate}><FileSpreadsheet className="h-4 w-4"/>Scarica template</Button>
        <Button variant="outline" className="min-h-10" disabled={!presenti.length} onClick={()=>onEsporta?.(presenti)}><Download className="h-4 w-4"/>Esporta kit</Button>
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-h-10 md:hidden"><MoreHorizontal className="h-4 w-4"/>Altro</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem className="min-h-10" onSelect={()=>onImporta?.()}><Upload className="h-4 w-4"/>Importa da Excel</DropdownMenuItem><DropdownMenuItem className="min-h-10" onSelect={()=>onTemplate?.()}><FileSpreadsheet className="h-4 w-4"/>Scarica template</DropdownMenuItem><DropdownMenuItem className="min-h-10" disabled={!presenti.length} onSelect={()=>onEsporta?.(presenti)}><Download className="h-4 w-4"/>Esporta kit</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <Button className="min-h-10" onClick={onNew}><Plus className="h-4 w-4"/>Nuovo kit</Button></div>}</header>
    {linee.length>1&&<div className="w-full sm:max-w-sm"><FiltroMultiplo etichetta="Linea" opzioni={linee.map(l=>({valore:l.codice,label:l.etichetta}))} selezionati={selezionate.filter(s=>linee.some(l=>l.codice===s))} onChange={onFilter} testoTutti="Tutte le linee" /></div>}
    {error?<p role="alert" className="text-sm text-destructive">Caricamento dei kit non riuscito.</p>:loading?<p role="status" className="text-sm text-muted-foreground">Caricamento…</p>:presenti.length===0?<div className="flex items-center gap-3 border-y py-8 text-muted-foreground"><Layers className="h-6 w-6"/><p>Nessun kit per le linee selezionate.</p></div>:
      visibili.map(linea=>{
        const dellaLinea=presenti.filter(k=>k.linea===linea.codice);if(!dellaLinea.length)return null;
        const gruppi=famiglie.filter(f=>f.linea===linea.codice).sort((a,b)=>a.ordine-b.ordine).map(f=>({id:f.id,nome:f.nome,kits:dellaLinea.filter(k=>k.famiglia_id===f.id)}));
        const senza=dellaLinea.filter(k=>!famiglie.some(f=>f.id===k.famiglia_id&&f.linea===linea.codice));
        if(senza.length)gruppi.push({id:'senza',nome:'Senza famiglia',kits:senza});
        return <section key={linea.codice} className="min-w-0 space-y-4"><div className="flex items-center gap-2 border-b pb-2"><BadgeLinea linea={linea.codice}/><span className="text-sm text-muted-foreground">{dellaLinea.length} kit</span></div>{gruppi.filter(g=>g.kits.length).map(g=><section key={g.id} className="space-y-2"><h2 className="text-sm font-semibold">{g.nome}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{g.kits.map(k=><Card key={k.id} className={`min-w-0 border-l-4 ${linea.classiBordo}`}><CardContent className="space-y-3 p-3 sm:p-4"><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{k.codice}</span><span className="shrink-0 font-mono text-xs">{k.um_base}</span></div><h3 className="break-words text-base font-semibold">{k.nome}</h3><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{k.componenti.length} componenti</span><div className="flex items-center gap-1"><Button asChild variant="outline" size="sm" className="min-h-10"><Link to="/kit/$id" params={{id:k.id}}><ArrowUpRight className="h-4 w-4"/>Apri</Link></Button>{gestisce&&<Button size="icon" variant="ghost" className="h-10 w-10" title={`Duplica ${k.codice}`} aria-label={`Duplica ${k.codice}`} disabled={busy} onClick={()=>onDuplicate(k.id)}><Copy className="h-4 w-4"/></Button>}</div></div></CardContent></Card>)}</div></section>)}</section>;
      })}
  </div>;
}
