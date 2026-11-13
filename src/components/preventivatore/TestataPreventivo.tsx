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
import { ExternalLink, FileText, HardHat, Percent, StickyNote, UserRound } from "lucide-react";
import { RiquadroScheda } from "./RiquadroScheda";

export function TestataPreventivo({prev,cliente,editMode,agenti,principali,haAlternative,listino,categoria,sede,onSave,onCliente,onChangeCliente,onCantiere,modoCantiere,onModoCantiere}: {
  prev: PreventivoConDettagli; cliente: DatiClientePreventivo|null|undefined; editMode:boolean; agenti:Agente[]; principali:{id:string;numero:string|null;titolo:string|null}[]; haAlternative:boolean; listino:string; categoria:string; sede:string;
  onSave:(patch:PreventivoUpdate)=>void; onCliente:()=>void; onChangeCliente:(id:string)=>void; onCantiere:(id:string)=>void; modoCantiere:'cantiere'|'provvisorio'; onModoCantiere:(v:'cantiere'|'provvisorio')=>void;
}) {
  const {data:codici=[]}=useCodiciPagamento();
  const pagamento=prev.condizione_pagamento_cod||cliente?.condizione_pagamento_cod||'';
  const pagamentoDesc=codici.find(c=>c.cod===pagamento)?.descrizione||cliente?.condizione_pagamento_desc||'';
  const save=(patch:PreventivoUpdate)=>onSave({...(!prev.condizione_pagamento_cod&&pagamento?{condizione_pagamento_cod:pagamento}:{}),...patch});
  const field=(label:string,value:ReactNode,control:ReactNode,wide=false)=><div key={label} className={`min-w-0 grid content-start gap-1 ${wide?'sm:col-span-2':''}`}><Label className="text-xs">{label}</Label>{editMode?control:<div className="min-h-[34px] text-sm break-words whitespace-pre-wrap py-1.5 border-b border-border/50">{value||'—'}</div>}</div>;
  const text=(key:'numero'|'titolo'|'filiale',label:string,wide=false)=>field(label,prev[key],<Input aria-label={label} key={`${key}-${prev[key]}`} className="h-[34px] bg-card" defaultValue={prev[key]||''} onBlur={e=>{if((e.target.value||null)!==prev[key])save({[key]:e.target.value||null});}}/>,wide);
  const select=(label:string,value:string,options:{value:string;label:string}[],onChange:(v:string)=>void,disabled=false)=><Select value={value||'__none__'} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="min-h-[34px] h-auto w-full min-w-0 bg-card [&>span]:whitespace-normal [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">—</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value} className="whitespace-normal break-words">{o.label}</SelectItem>)}</SelectContent></Select>;
  const agenteCliente=agenti.find(a=>a.id===cliente?.codice_agente)?.nome||cliente?.codice_agente||'';
  const info=(label:string,value:ReactNode)=><div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="min-h-[1.5rem] break-words text-sm">{value||'—'}</dd></div>;
  const due="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2";
  return <section className="grid grid-cols-1 gap-4 py-4 lg:grid-cols-2">
    <RiquadroScheda titolo="Documento" icona={FileText} tono="grigio">
      <div className={due}>
        {text('titolo','Titolo',true)}
        {text('numero','Numero')}
        {field('Data',formatDate(prev.data),<Input aria-label="Data" className="h-[34px] bg-card" type="date" defaultValue={prev.data} onBlur={e=>{if(e.target.value&&e.target.value!==prev.data)save({data:e.target.value});}}/>)}
        {field('Validità',prev.validita?formatDate(prev.validita):'—',<Input aria-label="Validità" className="h-[34px] bg-card" type="date" defaultValue={prev.validita||''} onBlur={e=>{if((e.target.value||null)!==prev.validita)save({validita:e.target.value||null});}}/>)}
        {field('Tipo documento',TIPI_DOC_LABEL[prev.tipo_doc],select('Tipo documento',prev.tipo_doc,TIPI_DOC.map(v=>({value:v,label:TIPI_DOC_LABEL[v]})),v=>{if(TIPI_DOC.includes(v as typeof prev.tipo_doc))save({tipo_doc:v as typeof prev.tipo_doc});}))}
        {field('Stato',STATI_LABEL[prev.stato],select('Stato',prev.stato,STATI.map(v=>({value:v,label:STATI_LABEL[v]})),v=>{if(STATI.includes(v as typeof prev.stato))save({stato:v as typeof prev.stato});}))}
        {field('Agente',agenti.find(a=>a.id===prev.agente_codice)?.nome,select('Agente',prev.agente_codice||'',agenti.map(a=>({value:a.id,label:a.nome})),v=>save({agente_codice:v==='__none__'?null:v})),true)}
        {field('Alternativa di',principali.find(p=>p.id===prev.alternativa_di)?.numero||'— Nessuna: è un preventivo principale',<div><Select value={prev.alternativa_di||'__none__'} disabled={haAlternative||prev.tipo!=='preventivo'} onValueChange={v=>save({alternativa_di:v==='__none__'?null:v})}><SelectTrigger aria-label="Alternativa di" className="h-auto min-h-[34px] bg-card [&>span]:whitespace-normal [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">— Nessuna: è un preventivo principale</SelectItem>{principali.map(p=><SelectItem key={p.id} value={p.id}>{p.numero} {p.titolo?`· ${p.titolo}`:''}</SelectItem>)}</SelectContent></Select>{haAlternative&&<p className="text-xs text-muted-foreground mt-1">Ha alternative collegate</p>}</div>,true)}
      </div>
    </RiquadroScheda>
    <RiquadroScheda titolo="Dati anagrafici cliente" icona={UserRound} tono="azzurro">
      {editMode&&<div className="mb-3 grid gap-1"><Label className="text-xs">Cliente (cerca per codice o nome)</Label><ClientePicker value={prev.cliente_id} onChange={onChangeCliente}/></div>}
      <p className="mb-2 break-words text-base font-semibold">{cliente?.ragione_sociale||prev.cliente?.ragione_sociale||'—'}</p>
      <dl className={due}>
        {info('Codice cliente',cliente?.codice_gestionale)}
        {info('P.IVA',cliente?.partita_iva)}
        <div className="min-w-0 sm:col-span-2">{info('Sede legale',[cliente?.indirizzo,[cliente?.cap,cliente?.citta,cliente?.provincia&&`(${cliente.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</div>
        {info('Telefono',cliente?.telefono&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.telefono}`}>{cliente.telefono}</a>)}
        {info('Cellulare',cliente?.cellulare&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.cellulare}`}>{cliente.cellulare}</a>)}
        {info('Email',cliente?.email&&<a className="break-all text-pv-blu hover:underline" href={`mailto:${cliente.email}`}>{cliente.email}</a>)}
        {info('PEC',cliente?.pec&&<span className="break-all">{cliente.pec}</span>)}
        {info('Sede MADE di riferimento',sede)}
        {info('Agente',agenteCliente)}
      </dl>
      <Button variant="link" onClick={onCliente} className="mt-2 h-auto min-h-10 p-0 text-pv-blu">Apri scheda cliente<ExternalLink className="size-3 shrink-0 ml-1"/></Button>
    </RiquadroScheda>
    <RiquadroScheda titolo="Condizioni commerciali" icona={Percent} tono="arancio">
      <div className={due}>
        {field('Listino',listino,<div className="min-h-[34px] py-1.5 text-sm">{listino}</div>)}
        {field('Categoria',categoria,<div className="min-h-[34px] py-1.5 text-sm break-words">{categoria}</div>)}
        {field('Condizione di pagamento',pagamento?`${pagamentoDesc||pagamento} (${pagamento})`:'—',<div>{select('Condizione di pagamento',pagamento,codici.map(c=>({value:c.cod,label:`${c.descrizione||''} (${c.cod})`})),v=>save({condizione_pagamento_cod:v==='__none__'?null:v}))}<p className="text-xs text-muted-foreground mt-1">Proposta dal cliente (Gamma) · modificabile</p></div>,true)}
        {field('IVA %',`${formatNumeroIt(prev.iva_perc||0)}%`,<Input aria-label="IVA %" className="h-[34px] bg-card" inputMode="decimal" defaultValue={formatNumeroIt(prev.iva_perc||0)} onBlur={e=>{const v=parseNumeroIt(e.target.value);if(v!==null&&v!==prev.iva_perc)save({iva_perc:v});}}/>)}
        {text('filiale','Filiale')}
      </div>
    </RiquadroScheda>
    <RiquadroScheda titolo="Cantiere" icona={HardHat} tono="verde">
      {field('Cantiere',prev.cantiere?.nome||prev.cantiere_descrizione||'Da definire',<div className="space-y-1"><div className="flex gap-1"><Button size="sm" variant={modoCantiere==='cantiere'?'default':'outline'} onClick={()=>onModoCantiere('cantiere')}>Cantiere</Button><Button size="sm" variant={modoCantiere==='provvisorio'?'default':'outline'} onClick={()=>onModoCantiere('provvisorio')}>Provvisorio</Button></div>{modoCantiere==='cantiere'?<CantierePicker cliente_id={prev.cliente_id} value={prev.cantiere_id} onChange={onCantiere}/>:<Input className="h-[34px] bg-card" aria-label="Cantiere provvisorio" defaultValue={prev.cantiere_descrizione||''} placeholder="Da definire" onBlur={e=>{const v=e.target.value.trim()||'Da definire';if(v!==prev.cantiere_descrizione)save({cantiere_descrizione:v,cantiere_id:null});}}/>}</div>)}
    </RiquadroScheda>
    <RiquadroScheda titolo="Note per il cliente" icona={StickyNote} tono="viola" className="lg:col-span-2">
      {field('Note',prev.note,<Textarea aria-label="Note" rows={3} className="bg-card" defaultValue={prev.note||''} onBlur={e=>{if((e.target.value||null)!==prev.note)save({note:e.target.value||null});}}/>,true)}
    </RiquadroScheda>
  </section>;
}