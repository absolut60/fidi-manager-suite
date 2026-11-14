import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { PrezziCantiereDialog } from '@/components/prezzi-cantiere-dialog';
import { ClienteCantieriTab } from '@/components/cliente-cantieri-tab';
import { chiavePrezziCantiere, type CantiereListinoRow } from '@/lib/cantiere-listini-api';
import type { CantiereRow } from '@/lib/cantieri';
export const Route = createFileRoute('/verifica-fm69')({ component: Verifica });
const c = { id: 'c-fm69', nome: 'Residenza giardini — Cantiere di prova', cliente_id: null, lead_id: 'l-fm69', agente_codice: null, created_by: null, attivo: true, provvisorio: false } as CantiereRow;
const rows = Array.from({length: 12}, (_, i) => ({ id: `r${i}`, cantiere_id: c.id, cod_gamma: `ART${i}`, descrizione: `Articolo di prova ${i} descrizione modificabile`, prezzo_vendita_speciale: 100, costo_netto_speciale: 40, sconti: [17,5], maggiorazione_perc: 0, um_scelta: 'um1', note: i === 1 ? 'Nota lunga che cresce in altezza quando il testo va a capo nella colonna senza allargare la riga.' : '', created_at: '', updated_at: '', created_by: null, updated_by: null })) as CantiereListinoRow[];
function Verifica() {
 const qc = useQueryClient(); const { user } = useAuth(); const [ready,setReady] = useState(false); const [open,setOpen] = useState(false);
 useEffect(() => {
 const seed = (key: readonly unknown[], data: unknown) => { qc.setQueryDefaults(key, { staleTime: Infinity }); qc.setQueryData(key,data); };
 seed(chiavePrezziCantiere(c.id),rows);
 seed(['prezzi-cantiere-modifica',user?.id,c.id,c.cliente_id,c.lead_id,c.agente_codice,c.created_by],true);
 seed(['prezzi-cantiere-unita',c.id,rows.map(r=>r.cod_gamma)], rows.map((r,i)=>({codice:r.cod_gamma,um:'PZ',um2:i===0?'PAL':null,fattore_conversione:i===0?25:null,costo_ultimo:45})));
 seed(['prezzi-cantiere-listino',c.id,rows.map(r=>r.cod_gamma)],new Map());
 seed(['articoli-gamma-preventivo','art',{famiglie:[],coppie:[],marche:[]}],Array.from({length:30},(_,i)=>({codice:`ART${i}`,descrizione:`Articolo Gamma risultato ${i} per la ricerca`,marca:'Marca',um:'PZ'})));
 seed(['cantieri','cliente-fm69'],[c,{...c,id:'c-altro',nome:'Cantiere senza prezzi'}]);
 seed(['prezzi-cantiere-conteggio','batch',['c-altro',c.id].sort()],{[c.id]:12,'c-altro':0});
 seed(['prezzi-cantiere-conteggio',c.id],12);
 seed(['agenti-lookup'],[]);
 setReady(true);
 },[qc,user?.id]);
 return ready ? <div className="p-4"><Button onClick={()=>setOpen(true)}>Apri prezzi</Button><ClienteCantieriTab clienteId="cliente-fm69" /><PrezziCantiereDialog open={open} onOpenChange={setOpen} cantiere={c}/></div> : null;
}
