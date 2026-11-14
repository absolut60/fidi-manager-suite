import { AllegatiSection } from "@/components/allegati-section";
import { NotePreventivo } from "./NotePreventivo";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { ClientePicker } from "./ClientePicker";
import { CantiereTestata } from "./CantiereTestata";
import { useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import { STATI,STATI_LABEL,TIPI_DOC,TIPI_DOC_LABEL,type PreventivoConDettagli,type PreventivoUpdate,type DatiClientePreventivo,type Agente } from "@/lib/preventivi-api";
import { formatNumeroIt,parseNumeroIt } from "@/lib/numero-it";
import { formatDate } from "@/lib/fidi";
import { ExternalLink, FileText, HardHat, Percent, Paperclip, StickyNote, UserRound } from "lucide-react";
import { RiquadroScheda } from "./RiquadroScheda";
import { IndicatoreClientePreventivo } from "./IndicatoreClientePreventivo";

export function TestataPreventivo({prev,cliente,modificabile,statoEditabile,agenti,principali,haAlternative,listino,categoria,sede,onSave,onCliente,onChangeCliente,onCantiere}: {
  prev: PreventivoConDettagli; cliente: DatiClientePreventivo|null|undefined; modificabile:boolean; statoEditabile:boolean; agenti:Agente[]; principali:{id:string;numero:string|null;titolo:string|null}[]; haAlternative:boolean; listino:string; categoria:string; sede:string;
  onSave:(patch:PreventivoUpdate)=>void; onCliente:()=>void; onChangeCliente:(id:string)=>void; onCantiere:(id:string)=>void;
}) {
  const {data:codici=[]}=useCodiciPagamento();
  const pagamento=prev.condizione_pagamento_cod||cliente?.condizione_pagamento_cod||'';
  const pagamentoDesc=codici.find(c=>c.cod===pagamento)?.descrizione||cliente?.condizione_pagamento_desc||'';
  const save=(patch:PreventivoUpdate)=>onSave({...(!prev.condizione_pagamento_cod&&pagamento?{condizione_pagamento_cod:pagamento}:{}),...patch});
  const field=(label:string,value:ReactNode,control:ReactNode,wide=false)=><div key={label} className={`min-w-0 grid content-start gap-1 ${wide?'col-span-2':''}`}><Label className="text-[11px] text-muted-foreground">{label}</Label>{modificabile?control:<div className="min-h-7 text-xs break-words whitespace-pre-wrap py-1">{value||'—'}</div>}</div>;
  const text=(key:'numero'|'titolo'|'filiale',label:string,wide=false)=>field(label,prev[key],<Input aria-label={label} key={`${key}-${prev[key]}`} className="h-7 bg-card px-2 text-xs md:text-xs" defaultValue={prev[key]||''} onBlur={e=>{if((e.target.value||null)!==prev[key])save({[key]:e.target.value||null});}}/>,wide);
  const select=(label:string,value:string,options:{value:string;label:string}[],onChange:(v:string)=>void,disabled=false)=><Select value={value||'__none__'} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="h-7 w-full min-w-0 bg-card px-2 text-xs [&>span]:truncate [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">—</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value} className="whitespace-normal break-words">{o.label}</SelectItem>)}</SelectContent></Select>;
  const agenteCliente=agenti.find(a=>a.id===cliente?.codice_agente)?.nome||cliente?.codice_agente||'';
  const identitaCliente=[cliente?.codice_gestionale,cliente?.ragione_sociale||prev.cliente?.ragione_sociale].filter(Boolean).join(' · ');
  const indirizzo=[cliente?.indirizzo,[cliente?.cap,cliente?.citta,cliente?.provincia&&`(${cliente.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const datoCliente=(etichetta:string,valore:ReactNode,ampio=false,mono=false)=><div className={`min-w-0 space-y-1 ${ampio?'col-span-2':''}`}><p className="text-[11px] text-muted-foreground">{etichetta}</p><div className={`break-words text-xs ${mono?'font-mono':''}`}>{valore||'—'}</div></div>;
  const etichettaSoggetto=cliente?.tipo_soggetto==='persona_fisica'?'Privato':cliente?.tipo_soggetto==='azienda'?'Azienda':null;
  const due="grid grid-cols-2 gap-x-2 gap-y-1.5 lg:grid-cols-5";
  return <section className="grid grid-cols-1 gap-2 py-2 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
    <div className="flex min-w-0 flex-col gap-2">
    <RiquadroScheda titolo="Documento" icona={FileText} tono="grigio" densita="compatta">
      <div className={due}>
        {text('titolo','Titolo',true)}
        {text('numero','Numero')}
        {field('Data',formatDate(prev.data),<Input aria-label="Data" className="h-7 bg-card px-2 text-xs md:text-xs" type="date" defaultValue={prev.data} onBlur={e=>{if(e.target.value&&e.target.value!==prev.data)save({data:e.target.value});}}/>)}
        {field('Validità',prev.validita?formatDate(prev.validita):'—',<Input aria-label="Validità" className="h-7 bg-card px-2 text-xs md:text-xs" type="date" defaultValue={prev.validita||''} onBlur={e=>{if((e.target.value||null)!==prev.validita)save({validita:e.target.value||null});}}/>)}
        {field('Tipo documento',TIPI_DOC_LABEL[prev.tipo_doc],select('Tipo documento',prev.tipo_doc,TIPI_DOC.map(v=>({value:v,label:TIPI_DOC_LABEL[v]})),v=>{if(TIPI_DOC.includes(v as typeof prev.tipo_doc))save({tipo_doc:v as typeof prev.tipo_doc});}))}
        {/* FM65 punto 3: lo Stato resta modificabile per chi ha il permesso anche da confermato/ordine (serve per riportarlo a Bozza/Inviato). */}
        {(modificabile||statoEditabile)
          ? <div className="min-w-0 grid content-start gap-1"><Label className="text-[11px] text-muted-foreground">Stato</Label>{select('Stato',prev.stato,STATI.map(v=>({value:v,label:STATI_LABEL[v]})),v=>{if(STATI.includes(v as typeof prev.stato))save({stato:v as typeof prev.stato});})}</div>
          : field('Stato',STATI_LABEL[prev.stato],<span/>)}
        {field('Agente',agenti.find(a=>a.id===prev.agente_codice)?.nome,select('Agente',prev.agente_codice||'',agenti.map(a=>({value:a.id,label:a.nome})),v=>save({agente_codice:v==='__none__'?null:v})))}
        {field('Alternativa di',principali.find(p=>p.id===prev.alternativa_di)?.numero||'— Nessuna: è un preventivo principale',<div><Select value={prev.alternativa_di||'__none__'} disabled={haAlternative||prev.tipo!=='preventivo'} onValueChange={v=>save({alternativa_di:v==='__none__'?null:v})}><SelectTrigger aria-label="Alternativa di" className="h-7 w-full min-w-0 bg-card px-2 text-xs [&>span]:truncate [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">— Nessuna: è un preventivo principale</SelectItem>{principali.map(p=><SelectItem key={p.id} value={p.id}>{p.numero} {p.titolo?`· ${p.titolo}`:''}</SelectItem>)}</SelectContent></Select>{haAlternative&&<p className="text-xs text-muted-foreground mt-1">Ha alternative collegate</p>}</div>,true)}
      </div>
    </RiquadroScheda>
    <RiquadroScheda titolo="Cliente" icona={UserRound} tono="azzurro" densita="compatta" intestazione={<div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">Cliente</h3>{etichettaSoggetto&&<span className="shrink-0 rounded-full border border-pv-blu/30 bg-pv-azzurro px-1.5 text-[10px] font-medium leading-4 text-pv-blu">{etichettaSoggetto}</span>}<IndicatoreClientePreventivo clienteId={prev.cliente_id}/></div>}>
      {modificabile?<div className="mb-2 [&>button]:h-7 [&>button]:min-h-7 [&>button]:w-full [&>button]:px-2 [&>button]:text-xs"><ClientePicker value={prev.cliente_id} onChange={onChangeCliente}/></div>:<p className="mb-2 break-words text-xs font-bold">{identitaCliente||'—'}</p>}
      <div className="grid grid-cols-2 gap-x-2 gap-y-2 lg:grid-cols-4">
        {datoCliente('P.IVA',cliente?.partita_iva,false,true)}
        {datoCliente('C.F.',cliente?.codice_fiscale,false,true)}
        {datoCliente('Sede legale',indirizzo,true)}
        {datoCliente('Sede MADE',sede)}
        {datoCliente('Telefono',cliente?.telefono&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.telefono}`}>{cliente.telefono}</a>)}
        {datoCliente('Cellulare',cliente?.cellulare&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.cellulare}`}>{cliente.cellulare}</a>)}
        {datoCliente('PEC',cliente?.pec&&<a className="break-all text-pv-blu hover:underline" href={`mailto:${cliente.pec}`}>{cliente.pec}</a>)}
        {datoCliente('Email',cliente?.email&&<a className="break-all text-pv-blu hover:underline" href={`mailto:${cliente.email}`}>{cliente.email}</a>,true)}
        {datoCliente('Agente',agenteCliente)}
        <div className="col-span-2 flex min-w-0 items-end"><Button variant="link" onClick={onCliente} className="h-7 max-w-full whitespace-normal p-0 text-left text-xs text-pv-blu">Apri scheda cliente<ExternalLink className="ml-1 size-3 shrink-0"/></Button></div>
      </div>
    </RiquadroScheda>
    </div>
    <div className="flex min-w-0 flex-col gap-2">
    <RiquadroScheda titolo="Condizioni commerciali" icona={Percent} tono="arancio" densita="compatta">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {field('Listino',listino,<div className="min-h-7 py-1 text-xs">{listino}</div>)}
        {field('Categoria',categoria,<div className="min-h-7 py-1 text-xs break-words">{categoria}</div>)}
        {field('Condizione di pagamento',pagamento?`${pagamentoDesc||pagamento} (${pagamento})`:'—',<div title="Proposta dal cliente (Gamma) · modificabile">{select('Condizione di pagamento',pagamento,codici.map(c=>({value:c.cod,label:`${c.descrizione||''} (${c.cod})`})),v=>save({condizione_pagamento_cod:v==='__none__'?null:v}))}</div>,true)}
        {field('IVA %',`${formatNumeroIt(prev.iva_perc||0)}%`,<Input aria-label="IVA %" className="h-7 bg-card px-2 text-xs md:text-xs" inputMode="decimal" defaultValue={formatNumeroIt(prev.iva_perc||0)} onBlur={e=>{const v=parseNumeroIt(e.target.value);if(v!==null&&v!==prev.iva_perc)save({iva_perc:v});}}/>)}
        {text('filiale','Filiale')}
      </div>
    </RiquadroScheda>
    <RiquadroScheda titolo="Cantiere" icona={HardHat} tono="verde" densita="compatta">
      <div className="[&>div]:space-y-1.5 [&_p]:text-xs [&_div.text-sm]:text-xs [&_button]:h-7 [&_button]:min-h-7 [&_button]:px-2 [&_button]:text-xs [&_button[role=combobox]]:w-full [&_div.space-y-2]:flex [&_div.space-y-2]:flex-col [&_div.space-y-2]:gap-1.5 [&_div.space-y-2]:space-y-0 [&_div[role=group]]:order-1 [&_div[role=group]]:flex-nowrap [&_div[role=group]_button]:px-1.5 [&_div[role=group]_button]:whitespace-normal [&_div[role=group]_button]:leading-tight [&_button[role=combobox]]:order-0">
        <CantiereTestata prev={prev} modificabile={modificabile} onCantiere={onCantiere} clienteEtichetta={identitaCliente}/>
      </div>
    </RiquadroScheda>
    </div>
    <RiquadroScheda titolo="Note" icona={StickyNote} tono="viola" densita="compatta">
      {modificabile?<Textarea aria-label="Note" rows={3} className="min-h-0 resize-none bg-card px-2 py-1 text-xs md:text-xs" defaultValue={prev.note||''} onBlur={e=>{if((e.target.value||null)!==prev.note)save({note:e.target.value||null});}}/>:<p className="whitespace-pre-wrap break-words text-xs">{prev.note||'—'}</p>}
      <NotePreventivo id={prev.id} modificabile={modificabile}/>
    </RiquadroScheda>
    <RiquadroScheda titolo="Allegati" icona={Paperclip} tono="grigio" densita="compatta" className="[&>header]:hidden">
      <AllegatiSection entitaTipo="preventivo" entitaId={prev.id} clienteId={null} canEdit={modificabile} eliminaTutti={modificabile} compact/>
    </RiquadroScheda>
  </section>;
}