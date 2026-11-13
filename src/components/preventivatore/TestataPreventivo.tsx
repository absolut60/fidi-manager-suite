import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { ClientePicker } from "./ClientePicker";
import { CantierePicker } from "./CantierePicker";
import { useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import { STATI,STATI_LABEL,TIPI_DOC,TIPI_DOC_LABEL,type PreventivoConDettagli,type PreventivoUpdate,type DatiClientePreventivo,type Agente } from "@/lib/preventivi-api";
import { formatNumeroIt,parseNumeroIt } from "@/lib/numero-it";
import { formatDate } from "@/lib/fidi";
import { ExternalLink } from "lucide-react";

export function TestataPreventivo({prev,cliente,editMode,agenti,principali,haAlternative,listino,categoria,onSave,onCliente,onChangeCliente,onCantiere,modoCantiere,onModoCantiere}: {
  prev: PreventivoConDettagli; cliente: DatiClientePreventivo|null|undefined; editMode:boolean; agenti:Agente[]; principali:{id:string;numero:string|null;titolo:string|null}[]; haAlternative:boolean; listino:string; categoria:string;
  onSave:(patch:PreventivoUpdate)=>void; onCliente:()=>void; onChangeCliente:(id:string)=>void; onCantiere:(id:string)=>void; modoCantiere:'cantiere'|'provvisorio'; onModoCantiere:(v:'cantiere'|'provvisorio')=>void;
}) {
  const {data:codici=[]}=useCodiciPagamento();
  const pagamento=prev.condizione_pagamento_cod||cliente?.condizione_pagamento_cod||'';
  const pagamentoDesc=codici.find(c=>c.cod===pagamento)?.descrizione||cliente?.condizione_pagamento_desc||'';
  const save=(patch:PreventivoUpdate)=>onSave({...(!prev.condizione_pagamento_cod&&pagamento?{condizione_pagamento_cod:pagamento}:{}),...patch});
  const field=(label:string,value:ReactNode,control:ReactNode,wide=false)=><div key={label} className={`min-w-0 grid content-start gap-1 ${wide?'md:col-span-2':''}`}><Label className="text-xs">{label}</Label>{editMode?control:<div className="min-h-[34px] text-sm break-words whitespace-pre-wrap py-1.5 border-b border-border/50">{value||'—'}</div>}</div>;
  const text=(key:'numero'|'titolo'|'filiale',label:string,wide=false)=>field(label,prev[key],<Input aria-label={label} key={`${key}-${prev[key]}`} className="h-[34px]" defaultValue={prev[key]||''} onBlur={e=>{if((e.target.value||null)!==prev[key])save({[key]:e.target.value||null});}}/>,wide);
  const select=(label:string,value:string,options:{value:string;label:string}[],onChange:(v:string)=>void,disabled=false)=><Select value={value||'__none__'} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="min-h-[34px] h-auto w-full min-w-0 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">—</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value} className="whitespace-normal break-words">{o.label}</SelectItem>)}</SelectContent></Select>;
  return <section className="py-4 space-y-4">
    <div className="bg-muted p-3 flex flex-col lg:flex-row gap-4 text-sm">
      <div className="min-w-0 flex-1"><Button variant="link" onClick={onCliente} className="h-auto min-h-10 p-0 text-left whitespace-normal font-semibold justify-start">{cliente?.ragione_sociale||prev.cliente?.ragione_sociale||'—'}<ExternalLink className="size-3 shrink-0 ml-1"/></Button><p>{cliente?.codice_gestionale||'—'} · P.IVA {cliente?.partita_iva||'—'}</p><p>{[cliente?.indirizzo,cliente?.cap,cliente?.citta,cliente?.provincia].filter(Boolean).join(' · ')||'—'}</p><p>{[cliente?.telefono,cliente?.cellulare].filter(Boolean).join(' · ')||'—'}</p><p className="break-words">{[cliente?.email,cliente?.pec].filter(Boolean).join(' · ')||'—'}</p></div>
      <div className="min-w-0 lg:w-64 space-y-1"><p>Listino: <strong>{listino}</strong></p><p>Categoria: <strong>{categoria}</strong></p><p>Sede: <strong>{prev.filiale||'—'}</strong></p></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3">
      {field('Cliente',[cliente?.codice_gestionale,cliente?.ragione_sociale].filter(Boolean).join(' · '),<ClientePicker value={prev.cliente_id} onChange={onChangeCliente}/>)}
      {field('Cantiere',prev.cantiere?.nome||prev.cantiere_descrizione||'Da definire',<div className="space-y-1"><div className="flex gap-1"><Button size="sm" variant={modoCantiere==='cantiere'?'default':'outline'} onClick={()=>onModoCantiere('cantiere')}>Cantiere</Button><Button size="sm" variant={modoCantiere==='provvisorio'?'default':'outline'} onClick={()=>onModoCantiere('provvisorio')}>Provvisorio</Button></div>{modoCantiere==='cantiere'?<CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={onCantiere}/>:<Input className="h-[34px]" aria-label="Cantiere provvisorio" defaultValue={prev.cantiere_descrizione||''} placeholder="Da definire" onBlur={e=>{const v=e.target.value.trim()||'Da definire';if(v!==prev.cantiere_descrizione)save({cantiere_descrizione:v,cantiere_id:null});}}/>}</div>)}
      {text('titolo','Titolo',true)}
      {field('Alternativa di',principali.find(p=>p.id===prev.alternativa_di)?.numero||'— Nessuna: è un preventivo principale',<div><Select value={prev.alternativa_di||'__none__'} disabled={haAlternative||prev.tipo!=='preventivo'} onValueChange={v=>save({alternativa_di:v==='__none__'?null:v})}><SelectTrigger aria-label="Alternativa di" className="h-auto min-h-[34px] [&>span]:whitespace-normal [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">— Nessuna: è un preventivo principale</SelectItem>{principali.map(p=><SelectItem key={p.id} value={p.id}>{p.numero} {p.titolo?`· ${p.titolo}`:''}</SelectItem>)}</SelectContent></Select>{haAlternative&&<p className="text-xs text-muted-foreground mt-1">Ha alternative collegate</p>}</div>,true)}
      {text('numero','Numero')}
      {field('Data',formatDate(prev.data),<Input aria-label="Data" className="h-[34px]" type="date" defaultValue={prev.data} onBlur={e=>{if(e.target.value&&e.target.value!==prev.data)save({data:e.target.value});}}/>)}
      {field('Validità',prev.validita?formatDate(prev.validita):'—',<Input aria-label="Validità" className="h-[34px]" type="date" defaultValue={prev.validita||''} onBlur={e=>{if((e.target.value||null)!==prev.validita)save({validita:e.target.value||null});}}/>)}
      {field('Stato',STATI_LABEL[prev.stato],select('Stato',prev.stato,STATI.map(v=>({value:v,label:STATI_LABEL[v]})),v=>{if(STATI.includes(v as typeof prev.stato))save({stato:v as typeof prev.stato});}))}
      {field('Agente',agenti.find(a=>a.id===prev.agente_codice)?.nome,select('Agente',prev.agente_codice||'',agenti.map(a=>({value:a.id,label:a.nome})),v=>save({agente_codice:v==='__none__'?null:v})))}
      {text('filiale','Filiale')}
      {field('Tipo documento',TIPI_DOC_LABEL[prev.tipo_doc],select('Tipo documento',prev.tipo_doc,TIPI_DOC.map(v=>({value:v,label:TIPI_DOC_LABEL[v]})),v=>{if(TIPI_DOC.includes(v as typeof prev.tipo_doc))save({tipo_doc:v as typeof prev.tipo_doc});}))}
      {field('IVA %',`${formatNumeroIt(prev.iva_perc||0)}%`,<Input aria-label="IVA %" className="h-[34px]" inputMode="decimal" defaultValue={formatNumeroIt(prev.iva_perc||0)} onBlur={e=>{const v=parseNumeroIt(e.target.value);if(v!==null&&v!==prev.iva_perc)save({iva_perc:v});}}/>)}
      {field('Condizione di pagamento',`${pagamento} – ${pagamentoDesc}`,<div>{select('Condizione di pagamento',pagamento,codici.map(c=>({value:c.cod,label:`${c.cod} – ${c.descrizione||''}`})),v=>save({condizione_pagamento_cod:v==='__none__'?null:v}))}<p className="text-xs text-muted-foreground mt-1">Proposta dal cliente (Gamma) · modificabile</p></div>,true)}
      {field('Note',prev.note,<Textarea aria-label="Note" rows={2} defaultValue={prev.note||''} onBlur={e=>{if((e.target.value||null)!==prev.note)save({note:e.target.value||null});}}/>,true)}
    </div>
  </section>;
}