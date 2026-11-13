import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PreventiviListView } from '@/components/preventivatore/PreventiviListView';
import { FasciaPreventivo } from '@/components/preventivatore/FasciaPreventivo';
export const Route = createFileRoute('/prova-correzioni-cd')({component: Prova});
function Prova(){
 const qc=useQueryClient();
 const [pronto]=useState(()=>{
  const base={tipo:'preventivo',tipo_doc:'PREVENTIVO',stato:'bozza',data:'2026-11-13',validita:'2026-11-20',created_at:'2026-11-13T12:00:00Z',cliente:{ragione_sociale:'IMPRESA EDILE CON NOME LUNGO',codice_gestionale:'13380'},cantiere:{nome:'Cantiere Milano'},creato_da_nome:'Andrea Giani',blocchi:[],totale:170.01};
  const principali=[1,2,3].map(n=>({...base,id:`p${n}`,numero:`PRV-16${n}/26`,titolo:`Titolo preventivo gruppo ${n}`,alternativa_di:null}));
  const alternative=[{...base,id:'a1',numero:'PRV-164/26',titolo:'Prima alternativa',alternativa_di:'p1'}, {...base,id:'a2',numero:'PRV-165/26',titolo:'Seconda alternativa',alternativa_di:'p1'}, {...base,id:'a3',numero:'PRV-166/26',titolo:'Alternativa gruppo 3',alternativa_di:'p3'}];
  qc.setQueryDefaults(['preventivi','elenco'],{staleTime:Infinity});
  qc.setQueryData(['preventivi','elenco',{search:'',cliente_id:[],stato:[],tipo_doc:[],creato_da:[],tipo:'preventivo'}],{principali,alternative});
  qc.setQueryDefaults(['clienti-list'],{staleTime:Infinity});qc.setQueryData(['clienti-list'],[]);
  return true;
 });
 return <main><div className="p-3"><FasciaPreventivo titolo="Preventivo lavori di ristrutturazione" dati={{cliente:'13380 · A.N. COSTRUZIONI SRL',cantiere:'Cantiere Milano',validita:'20/11/2026',listino:'30',categoria:'Impresa',pagamento:'Bonifico',imponibile:170.01,marginePerc:20.9,margineEuro:35.61}} onCliente={()=>{}}/><div className="mt-3 border border-pv-azzurro-bordo bg-pv-azzurro p-3 text-xs">Blocco 1</div></div><PreventiviListView tipo="preventivo" /></main>;
}
