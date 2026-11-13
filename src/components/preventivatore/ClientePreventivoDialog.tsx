import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DatiClientePreventivo } from "@/lib/preventivi-api";
import { urlClienteIncorporato } from "@/lib/vista-incorporata";

/** La scheda originale viene ospitata senza navigare il preventivo; RLS verificata prima di montarla. */
export function ClientePreventivoDialog({ cliente, onClose }: { cliente: DatiClientePreventivo; onClose:()=>void }) {
  const {data: completo,isLoading}=useQuery({queryKey:['cliente-preventivo-accesso-completo',cliente.id],queryFn:async()=>{
    const {data,error}=await supabase.from('clienti').select('id').eq('id',cliente.id).maybeSingle();
    if(error)return false;
    return !!data;
  }});
  return <Dialog open onOpenChange={(o)=>{if(!o)onClose();}}><DialogContent className="flex flex-col w-full max-w-full h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-lg sm:max-w-6xl sm:h-[90dvh] p-3"><DialogHeader className="pr-8"><DialogTitle className="break-words">{cliente.codice_gestionale} · {cliente.ragione_sociale}</DialogTitle></DialogHeader>
    {isLoading?<p>Caricamento…</p>:completo?<iframe title="Scheda completa cliente" src={urlClienteIncorporato(cliente.id)} className="w-full min-h-0 flex-1 border-0"/>:<div className="overflow-auto space-y-3 text-sm"><p className="text-muted-foreground">Scheda completa non disponibile per il tuo profilo</p><p>P.IVA {cliente.partita_iva||'—'}</p><p>{[cliente.indirizzo,cliente.cap,cliente.citta,cliente.provincia].filter(Boolean).join(' · ')}</p><p>{[cliente.telefono,cliente.cellulare].filter(Boolean).join(' · ')}</p><p className="break-words">{[cliente.email,cliente.pec].filter(Boolean).join(' · ')}</p><p>{cliente.condizione_pagamento_cod} – {cliente.condizione_pagamento_desc}</p></div>}
  </DialogContent></Dialog>;
}