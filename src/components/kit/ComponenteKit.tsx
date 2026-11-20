import { useEffect, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArticoloGammaPicker } from '@/components/preventivatore/ArticoloGammaPicker';
import { EditableNumberCell } from '@/components/preventivatore/EditableNumberCell';
import { cercaGammaKit, type KitConComponenti, type KitComponenteUpdate } from '@/lib/kit-api';
import { etichettaIncidenzaKit, patchArticoloKit } from '@/lib/kit-config';
import { incidenzaEffettivaKit, round4, TIPI_DRIVER, type TipoDriver } from '@/lib/incidenza';
import { lineaPreventivo, type LineaPreventivo, type ColonnaComponenteKit } from '@/lib/linee-preventivo';
import { formatNumeroIt } from '@/lib/numero-it';
import { toast } from 'sonner';

export type ComponenteKitVista = KitConComponenti['componenti'][number];
export const COLONNE_KIT_LABEL: Record<ColonnaComponenteKit,string> = {
  ruolo:'Ruolo',lato:'Lato',strato:'Strato',tipo_driver:'Tipo driver',valore_driver:'Valore driver',incidenza:'Incidenza',
};

export function ComponenteKit({row,linea,um,modificabile,mobile=false,onPatch,onDelete,onManuale}:{
  row:ComponenteKitVista;linea:LineaPreventivo;um:string;modificabile:boolean;mobile?:boolean;
  onPatch:(patch:KitComponenteUpdate)=>Promise<void>;onDelete:()=>void;onManuale:(r:ComponenteKitVista)=>void;
}) {
  const config=lineaPreventivo(linea).kit;
  const [codice,setCodice]=useState(row.articolo_codice??row.codice_articolo_fornitore??'');
  const [checking,setChecking]=useState(false);
  useEffect(()=>setCodice(row.articolo_codice??row.codice_articolo_fornitore??''),[row.articolo_codice,row.codice_articolo_fornitore]);
  const manuale=!row.articolo_codice;
  const incidenza=incidenzaEffettivaKit(row);
  async function confermaCodice(){
    const scritto=codice.trim();
    if(scritto===(row.articolo_codice??row.codice_articolo_fornitore??''))return;
    setChecking(true);
    try{
      const gamma=scritto?await cercaGammaKit(scritto):null;
      const patch=patchArticoloKit(scritto,gamma);
      await onPatch(patch);
      if(!gamma&&scritto)onManuale({...row,...patch,articolo:null});
    }catch(e){toast.error(e instanceof Error?e.message:'Verifica articolo non riuscita');}
    finally{setChecking(false);}
  }
  const articolo=<div className="min-w-0 space-y-2">
    <div className="flex min-w-0 items-center gap-1"><Input className="min-h-11 min-w-0 font-mono text-xs" aria-label="Codice articolo" value={codice} disabled={!modificabile||checking}
      onChange={e=>setCodice(e.target.value)} onBlur={()=>void confermaCodice()} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
      {manuale&&<Badge variant="outline" className="shrink-0 text-xs">manuale</Badge>}
    </div>
    {row.articolo?.descrizione||row.descrizione?<p className="break-words text-xs">{row.articolo?.descrizione??row.descrizione}</p>:null}
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>U.M. {row.articolo?.um??row.um??'—'}</span>
      {row.articolo?.peso_netto!=null&&incidenza!=null&&<span>{formatNumeroIt(round4(row.articolo.peso_netto*incidenza),{maxDecimals:4})} kg/{um}</span>}
    </div>
    <div className="flex flex-wrap gap-1">{modificabile&&<div className="min-w-0 flex-1 [&_button[role=combobox]]:min-h-10"><ArticoloGammaPicker preventivoId={`kit:${row.kit_id}`} codice={row.articolo_codice} descrizione={row.articolo?.descrizione??null}
      onChange={a=>void onPatch(patchArticoloKit(a.codice,a))}/></div>}
      {manuale&&modificabile&&<Button variant="outline" size="sm" className="min-h-10" onClick={()=>onManuale(row)}><Search className="h-3.5 w-3.5"/>Definisci articolo</Button>}
    </div>
    {modificabile?<Input className="min-h-10 text-xs" aria-label="Note componente" placeholder="Note" defaultValue={row.note??''} onBlur={e=>{if((e.target.value.trim()||null)!==row.note)void onPatch({note:e.target.value.trim()||null});}}/>:row.note&&<p className="break-words text-xs text-muted-foreground">{row.note}</p>}
  </div>;
  function campo(colonna:ColonnaComponenteKit){
    if(colonna==='ruolo')return <Input aria-label="Ruolo" className="min-h-11 text-xs" disabled={!modificabile} defaultValue={row.ruolo??''} onBlur={e=>{if((e.target.value||null)!==row.ruolo)void onPatch({ruolo:e.target.value||null});}}/>;
    if(colonna==='tipo_driver')return <Select value={row.tipo_driver??'__none__'} disabled={!modificabile} onValueChange={v=>void onPatch({tipo_driver:v==='__none__'?null:v as TipoDriver})}><SelectTrigger aria-label="Tipo driver" className="min-h-11 px-1 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Nessuno</SelectItem>{TIPI_DRIVER.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>;
    const value=colonna==='incidenza'?row.incidenza:row[colonna];
    return <><EditableNumberCell className="min-h-11" ariaLabel={colonna==='incidenza'?etichettaIncidenzaKit(linea,um):COLONNE_KIT_LABEL[colonna]} value={value} disabled={!modificabile} decimali={colonna==='lato'||colonna==='strato'?0:4}
      onCommit={v=>onPatch({[colonna]:v!=null&&(colonna==='lato'||colonna==='strato')?Math.round(v):v})}/>
      {colonna==='incidenza'&&row.incidenza==null&&incidenza!=null&&<span className="block text-right text-xs text-muted-foreground">Driver: {formatNumeroIt(incidenza,{maxDecimals:4})}</span>}
    </>;
  }
  const elimina=modificabile&&<Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-destructive" aria-label="Elimina componente" title="Elimina componente" onClick={onDelete}><Trash2 className="h-4 w-4"/></Button>;
  return mobile?<Card className={`min-w-0 border-l-4 ${lineaPreventivo(linea).classiBordo}`}><CardContent className="space-y-3 p-3"><div className="flex items-start gap-1"><div className="min-w-0 flex-1">{articolo}</div>{elimina}</div><div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{config.colonneComponente.map(c=><div key={c} className="grid min-w-0 gap-1"><Label className="text-xs">{c==='incidenza'?etichettaIncidenzaKit(linea,um):COLONNE_KIT_LABEL[c]}</Label>{campo(c)}</div>)}</div></CardContent></Card>
    :<TableRow className="align-top text-xs"><TableCell className="p-2">{articolo}</TableCell>{config.colonneComponente.map(c=><TableCell className="p-1.5" key={c}>{campo(c)}</TableCell>)}<TableCell className="p-1.5">{elimina}</TableCell></TableRow>;
}