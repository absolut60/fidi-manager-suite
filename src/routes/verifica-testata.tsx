import { createFileRoute } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { TestataPreventivo } from '@/components/preventivatore/TestataPreventivo';
import { BadgeCondizioniRiferimento } from '@/components/preventivatore/BadgeCondizioniRiferimento';
import type { PreventivoConDettagli } from '@/lib/preventivi-api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/verifica-testata')({
  head: () => ({ meta: [{title:'Verifica Testata — FidiManager'}, {name:'description',content:'Verifica temporanea della Testata preventivo.'}, {property:'og:title',content:'Verifica Testata — FidiManager'}, {property:'og:description',content:'Verifica temporanea della Testata preventivo.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: Verifica,
});
function Verifica() {
  const [cliente, setCliente] = useState(false);
  const [qc] = useState(() => new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}}));
  const id = 'verifica';
  const [prev, setPrev] = useState({id,numero:'PRV-167/26',titolo:'Arredo bagno e pavimenti',tipo:'preventivo',tipo_doc:'PREVENTIVO',stato:'bozza',data:'2026-11-15',validita:'2026-11-22',linea:'showroom',cliente_id:null,lead_id:'lead-test',lead:{ragione_sociale:'PIPPO SRL',telefono:'02 1234567',email:'pippo@example.test',sede:{nome:'Lissone'}},cliente:null,cantiere:null,cantiere_id:null,agente_codice:null,filiale:'Lissone',store_id:null,condizione_pagamento_cod:null,iva_perc:22,regime_iva:'ordinaria',listino_rif:30,macrocategoria_rif:'01',categoria_rif:'01',assegnato_a:null,assegnati_copia:[],note:'Consegna e posa da concordare con il committente.',blocchi:[]} as unknown as PreventivoConDettagli);
  for (const [key,data] of [
    [['stores-attivi'],[]], [['utenti-assegnabili'],[]], [['preventivi-note',id],[]], [['allegati','preventivo',id],[]], [['attivita-commerciale','preventivo',id],[{id:'a1',tipo:'email',titolo:'Invio preventivo PRV-167/26',completata:true,data_pianificata:'2026-11-15T18:00:00',data_svolgimento:'2026-11-15T18:00:00',esito:null}]], [['cantieri-lite','cliente-test'],[{id:'c1',nome:'Ristrutturazione abitazione',citta:'Monza',attivo:true}]], [['indicatore-cliente-preventivo','cliente-test'],null],
  ] as const) qc.setQueryData([...key],data);
  const cataloghi={listini:[{codice:30,descrizione:'Listino 30'}],macrocategorie:[{codice:'01',label:'Imprese'}],categorie:[{codice:'01',label:'Generale'}]};
  const documento = cliente ? {...prev,cliente_id:'cliente-test',lead_id:null,lead:null,cliente:{ragione_sociale:'IMPRESA ROSSI SPA'}} as PreventivoConDettagli : prev;
  return <main className="min-h-screen bg-background p-3 text-foreground sm:p-6"><Button variant="outline" onClick={()=>setCliente(v=>!v)}>Cambia esempio</Button><h1 className="my-3 text-xl font-bold">PRV-167/26 · Testata</h1><QueryClientProvider client={qc}><TestataPreventivo prev={documento} cliente={null} modificabile statoEditabile agenti={[]} principali={[]} haAlternative={false} listino="Listino 30" categoria="Generale" sede="Lissone" onSave={patch=>setPrev(p=>({...p,...patch}))} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}} cataloghiRiferimento={cataloghi} caricamentoCataloghi={false} onRiferimento={async()=>{}} badgeRiferimento={<BadgeCondizioniRiferimento riferimento={prev} cataloghi={cataloghi}/>} /></QueryClientProvider></main>;
}