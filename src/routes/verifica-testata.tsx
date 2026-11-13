import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import { Button } from "@/components/ui/button";
import type { DatiClientePreventivo, PreventivoConDettagli, PreventivoUpdate } from "@/lib/preventivi-api";

export const Route = createFileRoute('/verifica-testata')({
  head: () => ({meta: [{title:'Verifica Testata | FidiManager'}, {name:'description',content:'Verifica temporanea della Testata MADE.'}, {property:'og:title',content:'Verifica Testata | FidiManager'}, {property:'og:description',content:'Verifica temporanea della Testata MADE.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}]}),
  component: Verifica,
});
const cliente = {id:'test-cliente', codice_gestionale:'001234', ragione_sociale:'EDILIZIA ROSSI E FIGLI S.R.L.', partita_iva:'01234567890', indirizzo:'Via delle Costruzioni 15', cap:'20100',citta:'Milano',provincia:'MI',telefono:'021234567',cellulare:'3331234567',email:'info@example.test',pec:'pec@example.test',codice_agente:'A1',condizione_pagamento_cod:'RB30',condizione_pagamento_desc:'RiBa 30 giorni'} as DatiClientePreventivo;
const initial = {id:'test-prev',cliente_id:cliente.id,cliente,numero:'PRV-161/26',titolo:'Ristrutturazione bagno e rivestimenti',data:'2026-11-13',validita:'2026-12-13',tipo:'preventivo',tipo_doc:'preventivo',stato:'bozza',agente_codice:'A1',alternativa_di:null,iva_perc:22,filiale:'Milano',condizione_pagamento_cod:'RB30',cantiere_id:null,cantiere:null,note:'Fornitura materiali per ristrutturazione. Consegna da concordare.',blocchi:[],prezziSpeciali:[]} as unknown as PreventivoConDettagli;
function Verifica(){
  const [qc]=useState(()=>{const q=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});q.setQueryData(['codici-pagamento','all'],[{cod:'RB30',descrizione:'RiBa 30 giorni'},{cod:'BB',descrizione:'Bonifico bancario'}]);q.setQueryData(['cliente-preventivo-dati',cliente.id],cliente);q.setQueryData(['clienti-preventivo-search',''],[cliente]);q.setQueryData(['cantieri-lite',cliente.id],[]);return q;});
  const [lettura,setLettura]=useState(false);
  const [prev,setPrev]=useState(initial);
  const [patch,setPatch]=useState<PreventivoUpdate>({});
  return <QueryClientProvider client={qc}><main className="p-4"><Button onClick={()=>setLettura(v=>!v)}>{lettura?'Modifica':'Sola lettura'}</Button><TestataPreventivo prev={prev} cliente={cliente} modificabile={!lettura} statoEditabile={false} agenti={[{id:'A1',nome:'Mario Rossi'}]} principali={[]} haAlternative={false} listino="Listino 01" categoria="Impresa" sede="Milano" onSave={p=>{setPatch(p);setPrev(v=>({...v,...p}));}} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}}/><output aria-label="Ultimo salvataggio">{JSON.stringify(patch)}</output></main></QueryClientProvider>;
}