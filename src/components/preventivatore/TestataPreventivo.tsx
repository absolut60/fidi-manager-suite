import { AllegatiSection } from "@/components/allegati-section";
import { NotePreventivo } from "./NotePreventivo";
import { AttivitaPreventivo } from "./AttivitaPreventivo";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { AzioneRiquadro } from "./AzioneRiquadro";
import { CantiereTestata } from "./CantiereTestata";
import { useCodiciPagamento, CondizionePagamentoRichiestaSelect, etichettaCondizionePagamento } from "@/components/condizione-pagamento-richiesta-select";
import { STATI,STATI_LABEL,TIPI_DOC,TIPI_DOC_LABEL,type PreventivoConDettagli,type PreventivoUpdate,type DatiClientePreventivo,type Agente } from "@/lib/preventivi-api";
import { formatNumeroIt,parseNumeroIt } from "@/lib/numero-it";
import { formatDate } from "@/lib/fidi";
import { ExternalLink, FileText, HardHat, Percent, Paperclip, StickyNote, UserRound } from "lucide-react";
import { RiquadroScheda } from "./RiquadroScheda";
import { IndicatoreClientePreventivo } from "./IndicatoreClientePreventivo";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { campiSedePreventivo } from "@/lib/preventivo-creazione";
import { CondizioniRiferimento } from "./CondizioniRiferimento";
import type { CataloghiRiferimento, RiferimentoPreventivo } from "@/lib/condizioni-riferimento";
import { nomeLeadPreventivo } from "@/lib/soggetto-preventivo";
import { AssegnazionePreventivo } from './AssegnazionePreventivo';
import { lineaPreventivo } from '@/lib/linee-preventivo';
import { REGIMI_IVA, regimeIvaValido } from '@/lib/calcolo-iva';

export function TestataPreventivo({prev,cliente,modificabile,statoEditabile,agenti,principali,haAlternative,listino,categoria,sede,sedeClienteId,onSave,onCliente,onChangeCliente,onCantiere,cataloghiRiferimento,erroreCataloghi,caricamentoCataloghi,onRiferimento,badgeRiferimento,onCambiaSoggetto}: {
  onCambiaSoggetto?: () => void;
  cataloghiRiferimento?: CataloghiRiferimento; erroreCataloghi?: string; caricamentoCataloghi: boolean; onRiferimento: (patch: RiferimentoPreventivo) => Promise<void>; badgeRiferimento?: ReactNode;
  prev: PreventivoConDettagli; cliente: DatiClientePreventivo|null|undefined; modificabile:boolean; statoEditabile:boolean; agenti:Agente[]; principali:{id:string;numero:string|null;titolo:string|null}[]; haAlternative:boolean; listino:string; categoria:string; sede:string; sedeClienteId?:string|null;
  onSave:(patch:PreventivoUpdate)=>void; onCliente:()=>void; onChangeCliente:(id:string)=>void; onCantiere:(id:string)=>void|Promise<void>;
}) {
  const {data:codici=[]}=useCodiciPagamento();
  const {data:stores=[]}=useQuery({queryKey:["stores-attivi"],queryFn:async()=>{const {data,error}=await supabase.from("stores").select("id, codice, nome").eq("attivo",true).order("codice");if(error)throw error;return data??[];}});
  const pagamento=prev.condizione_pagamento_cod||cliente?.condizione_pagamento_cod||'';
  const pagamentoDesc=codici.find(c=>c.cod===pagamento)?.descrizione||cliente?.condizione_pagamento_desc||'';
  const save=(patch:PreventivoUpdate)=>onSave({...(!prev.condizione_pagamento_cod&&pagamento?{condizione_pagamento_cod:pagamento}:{}),...patch});
  const field=(label:string,value:ReactNode,control:ReactNode,wide=false)=><div key={label} className={`min-w-0 grid content-start gap-1 ${wide?'col-span-2':''}`}><Label className="text-[11px] text-muted-foreground">{label}</Label>{modificabile?control:<div className="min-h-7 text-xs break-words whitespace-pre-wrap py-1">{value||'—'}</div>}</div>;
  const text=(key:'titolo',label:string,wide=false)=>field(label,prev[key],<Input aria-label={label} key={`${key}-${prev[key]}`} className="h-7 bg-card px-2 text-xs md:text-xs" defaultValue={prev[key]||''} onBlur={e=>{if((e.target.value||null)!==prev[key])save({[key]:e.target.value||null});}}/>,wide);
  const select=(label:string,value:string,options:{value:string;label:string}[],onChange:(v:string)=>void,disabled=false)=><Select value={value||'__none__'} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="h-7 w-full min-w-0 bg-card px-2 text-xs [&>span]:truncate [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">—</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value} className="whitespace-normal break-words">{o.label}</SelectItem>)}</SelectContent></Select>;
  const agenteCliente=agenti.find(a=>a.id===cliente?.codice_agente)?.nome||cliente?.codice_agente||'';
  const identitaCliente=prev.lead_id ? nomeLeadPreventivo(prev.lead) : [cliente?.codice_gestionale,cliente?.ragione_sociale||prev.cliente?.ragione_sociale].filter(Boolean).join(' · ');
  const indirizzo=[cliente?.indirizzo,[cliente?.cap,cliente?.citta,cliente?.provincia&&`(${cliente.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const datoCliente=(etichetta:string,valore:ReactNode,ampio=false,mono=false)=><div className={`min-w-0 space-y-1 ${ampio?'col-span-2':''}`}><p className="text-[11px] text-muted-foreground">{etichetta}</p><div className={`break-words text-xs ${mono?'font-mono':''}`}>{valore||'—'}</div></div>;
  const etichettaSoggetto=cliente?.tipo_soggetto==='persona_fisica'?'Privato':cliente?.tipo_soggetto==='azienda'?'Azienda':null;
  const due="grid grid-cols-2 gap-x-2 gap-y-1.5 lg:grid-cols-5";
  return <section className="grid grid-cols-1 gap-2 py-2 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
    <div className="flex min-w-0 flex-col gap-2">
    <RiquadroScheda titolo="Documento" icona={FileText} tono="grigio" densita="compatta">
      <div className={due}>
        {text('titolo','Titolo',true)}
        <div className="grid min-w-0 content-start gap-1"><Label className="text-[11px] text-muted-foreground">Numero</Label><p aria-label="Numero" className="min-h-7 break-words py-1 font-mono text-xs">{prev.numero || '—'}</p></div>
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
    <RiquadroScheda titolo={prev.lead_id ? "Lead" : "Cliente"} icona={UserRound} tono="azzurro" densita="compatta" azioni={<AzioneRiquadro icona={ExternalLink} etichetta={prev.lead_id ? "Apri scheda lead" : "Apri scheda cliente"} onClick={onCliente}/>} intestazione={<div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{prev.lead_id ? "Lead" : "Cliente"}</h3>{etichettaSoggetto&&<span className="shrink-0 rounded-full border border-pv-blu/30 bg-pv-azzurro px-1.5 text-[10px] font-medium leading-4 text-pv-blu">{etichettaSoggetto}</span>}<IndicatoreClientePreventivo clienteId={prev.cliente_id}/></div>}>
      <p className="mb-2 break-words text-xs font-bold">{identitaCliente||'—'}</p>
      {modificabile && <Button type="button" size="sm" variant="outline" onClick={onCambiaSoggetto}>Cambia soggetto</Button>}
      {prev.lead_id ? <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{datoCliente('Telefono',prev.lead?.telefono)}{datoCliente('Email',prev.lead?.email)}{datoCliente('Sede MADE',prev.lead?.sede?.nome)}</div> : <div className="grid grid-cols-2 gap-x-2 gap-y-2 lg:grid-cols-4">
        {datoCliente('P.IVA',cliente?.partita_iva,false,true)}
        {datoCliente('C.F.',cliente?.codice_fiscale,false,true)}
        {datoCliente('Sede legale',indirizzo,true)}
        {datoCliente('Sede MADE',sede)}
        {datoCliente('Telefono',cliente?.telefono&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.telefono}`}>{cliente.telefono}</a>)}
        {datoCliente('Cellulare',cliente?.cellulare&&<a className="text-pv-blu hover:underline" href={`tel:${cliente.cellulare}`}>{cliente.cellulare}</a>)}
        {datoCliente('PEC',cliente?.pec&&<a className="break-all text-pv-blu hover:underline" href={`mailto:${cliente.pec}`}>{cliente.pec}</a>)}
        {datoCliente('Email',cliente?.email&&<a className="break-all text-pv-blu hover:underline" href={`mailto:${cliente.email}`}>{cliente.email}</a>,true)}
        {datoCliente('Agente',agenteCliente)}
      </div>}
    </RiquadroScheda>
    </div>
    <div className="flex min-w-0 flex-col gap-2">
    <AssegnazionePreventivo prev={prev} modificabile={modificabile}/>
    <RiquadroScheda titolo="Condizioni commerciali" icona={Percent} tono="arancio" densita="compatta">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {!prev.lead_id && field('Listino del cliente',listino,<div className="min-h-7 py-1 text-xs">{listino}</div>)}
        {!prev.lead_id && field('Categoria del cliente',categoria,<div className="min-h-7 py-1 text-xs break-words">{categoria}</div>)}
        <CondizioniRiferimento key={`${prev.id}:${prev.listino_rif}:${prev.macrocategoria_rif}:${prev.categoria_rif}`} obbligatorio={!!prev.lead_id} riferimento={prev} cataloghi={cataloghiRiferimento} errore={erroreCataloghi} caricamento={caricamentoCataloghi} modificabile={modificabile} onSave={onRiferimento}/>
        {field('Condizione di pagamento',etichettaCondizionePagamento(codici,pagamento,cliente?.condizione_pagamento_desc),<CondizionePagamentoRichiestaSelect ariaLabel="Condizione di pagamento" size="sm" value={pagamento} descFallback={cliente?.condizione_pagamento_desc} onChange={v=>save({condizione_pagamento_cod:v||null})}/>,true)}
        {field('IVA %',`${formatNumeroIt(prev.iva_perc||0)}%`,<Input aria-label="IVA %" className="h-7 bg-card px-2 text-xs md:text-xs" inputMode="decimal" defaultValue={formatNumeroIt(prev.iva_perc||0)} onBlur={e=>{const v=parseNumeroIt(e.target.value);if(v!==null&&v!==prev.iva_perc)save({iva_perc:v});}}/>)}
        {lineaPreventivo(prev.linea).blocchi.regimiIva && field('Regime IVA',REGIMI_IVA.find(r=>r.value===regimeIvaValido(prev.regime_iva))?.label,<Select value={regimeIvaValido(prev.regime_iva)} onValueChange={v=>{const r=regimeIvaValido(v);if(r!==prev.regime_iva)save({regime_iva:r});}}><SelectTrigger aria-label="Regime IVA" className="h-7 w-full min-w-0 bg-card px-2 text-xs [&>span]:truncate [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent>{REGIMI_IVA.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>)}
        {field('Filiale',prev.filiale,select('Filiale',prev.store_id||'',stores.map(s=>({value:s.id,label:s.nome})),id=>save(campiSedePreventivo(stores.find(s=>s.id===id)??null))))}
      </div>
    </RiquadroScheda>
    <CantiereTestata prev={prev} modificabile={modificabile} onCantiere={onCantiere} clienteEtichetta={identitaCliente} sedeClienteNome={sede} sedeClienteId={sedeClienteId} badgeRiferimento={badgeRiferimento}/>
    </div>
    <RiquadroScheda titolo="Note" icona={StickyNote} tono="viola" densita="compatta">
      {modificabile?<Textarea aria-label="Note" rows={3} className="min-h-0 resize-none bg-card px-2 py-1 text-xs md:text-xs" defaultValue={prev.note||''} onBlur={e=>{if((e.target.value||null)!==prev.note)save({note:e.target.value||null});}}/>:<p className="whitespace-pre-wrap break-words text-xs">{prev.note||'—'}</p>}
      <NotePreventivo id={prev.id} modificabile={modificabile}/>
    </RiquadroScheda>
    <RiquadroScheda titolo="Allegati" icona={Paperclip} tono="grigio" densita="compatta" className="[&>header]:hidden">
      <AllegatiSection entitaTipo="preventivo" entitaId={prev.id} clienteId={null} canEdit={modificabile} eliminaTutti={modificabile} compact/>
    </RiquadroScheda>
    <AttivitaPreventivo id={prev.id} clienteId={prev.cliente_id} agenteCodice={prev.agente_codice} sedeNome={sede} sedeClienteId={sedeClienteId} modificabile={modificabile}/>
  </section>;
}