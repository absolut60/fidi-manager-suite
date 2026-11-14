import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RigheTable } from '@/components/preventivatore/RigheTable';
import { AggiungiBloccoDialog } from '@/components/preventivatore/AggiungiBloccoDialog';
import { PrezziCantiereDialog } from '@/components/prezzi-cantiere-dialog';
import { analizzaAggiornaListini, applicaAggiornaListini, fetchPreventivo } from '@/lib/preventivi-api';
export const Route=createFileRoute('/fm71-verifica-temporanea')({component:Prova});
function Prova(){
 const [kit,setKit]=useState(false),[sito,setSito]=useState(false),[esito,setEsito]=useState('');
 const {data:prev}=useQuery({queryKey:['preventivo','11111111-1111-4111-8111-111111111111'],queryFn:()=>fetchPreventivo('11111111-1111-4111-8111-111111111111')});
 if(!prev)return <p>Caricamento</p>;
 return <main className="p-4"><div className="flex gap-2"><Button onClick={()=>setKit(true)}>Da Kit</Button><Button onClick={()=>setSito(true)}>Prezzi del cantiere</Button><Button onClick={async()=>{const a=await analizzaAggiornaListini(prev.id); await applicaAggiornaListini(prev.id,a.differenze);setEsito('Aggiornate '+a.differenze.length);}}>Aggiorna listini</Button></div><p role="status">{esito}</p>{prev.blocchi.map(b=><RigheTable key={b.id} blocco={b} preventivoId={prev.id} fascia="A" clienteId={prev.cliente_id} cantiereId={prev.cantiere_id} condizioniPrezzi={prev}/>)}<AggiungiBloccoDialog open={kit} onOpenChange={setKit} preventivoId={prev.id} clienteId={prev.cliente_id} cantiereId={prev.cantiere_id} condizioniPrezzi={prev} lastOrdine={10}/>{prev.cantiere&&<PrezziCantiereDialog open={sito} onOpenChange={setSito} cantiere={prev.cantiere as never} condizioniPrezzi={prev}/>}</main>;
}
