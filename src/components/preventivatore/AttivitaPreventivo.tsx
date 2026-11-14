import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AttivitaCommercialeDialog } from "@/components/attivita-commerciale-dialog";
import { fmtDataOra, luogoAttivita, ordinaAttivitaPreventivo, TIPO_ATTIVITA_LABEL, type AttivitaRow } from "@/lib/attivita-commerciale";
import { RiquadroScheda } from "./RiquadroScheda";

export function AttivitaPreventivo({ id, clienteId, agenteCodice, sedeNome, sedeClienteId, modificabile }: {
  id: string; clienteId: string | null; agenteCodice: string | null; sedeNome: string; sedeClienteId?: string | null; modificabile: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [selezionata, setSelezionata] = useState<AttivitaRow | null>(null);
  // Identità dalla RPC condizioni; verifica sul catalogo sedi con RLS, mai per nome.
  const { data: sede, isPending: sedeInCaricamento, error: erroreSede } = useQuery({
    queryKey: ["sede-attivita-preventivo", sedeClienteId],
    enabled: modificabile && !!sedeClienteId,
    queryFn: async () => {
      if (!sedeClienteId) return null;
      const { data, error } = await supabase.from("stores").select("id").eq("id", sedeClienteId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Sede del cliente non disponibile");
      return data;
    },
  });
  const { data: attivita = [], isPending, error } = useQuery({
    queryKey: ["attivita-commerciale", "preventivo", id],
    queryFn: async () => {
      const righe: AttivitaRow[] = [];
      // Legge anche oltre il limite Data API: conteggio e lista condividono gli stessi dati.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("attivita_commerciale")
          .select("*, sede_riferimento:stores!attivita_commerciale_sede_riferimento_id_fkey(nome)")
          .eq("preventivo_id", id).order("id").range(offset, offset + 499);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      return ordinaAttivitaPreventivo(righe);
    },
  });
  return <RiquadroScheda titolo={`Attività commerciali (${attivita.length})`} icona={CalendarClock} tono="azzurro" densita="compatta" className="lg:col-span-2">
    {isPending && <p className="text-xs text-muted-foreground">Caricamento attività…</p>}
    {error && <p role="alert" className="text-xs text-destructive">Impossibile caricare le attività.</p>}
    {!isPending && !error && !attivita.length && <p className="text-xs text-muted-foreground">Nessuna attività registrata.</p>}
    <div className="divide-y">
      {attivita.map(a => {
        const contenuto = <>
          <div className="min-w-0 space-y-1"><p className="break-words"><span className="text-muted-foreground">{TIPO_ATTIVITA_LABEL[a.tipo]} · </span><span className="font-semibold">{a.titolo}</span></p>{luogoAttivita(a) && <p className="break-words text-muted-foreground">{luogoAttivita(a)}</p>}{a.esito && <p className="break-words">Esito: {a.esito}</p>}</div>
          <div className="min-w-0 space-y-1 text-muted-foreground"><p>Pianificata: {fmtDataOra(a.data_pianificata)}</p>{a.data_svolgimento && <p>Svolta: {fmtDataOra(a.data_svolgimento)}</p>}<p className="font-medium text-foreground">{a.completata ? "Completata" : "Da svolgere"}</p></div>
        </>;
        const stile = "grid w-full min-w-0 grid-cols-1 gap-2 py-3 text-left text-xs lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]";
        return modificabile
          ? <Button key={a.id} variant="ghost" className={`${stile} h-auto justify-start whitespace-normal rounded-none px-0`} onClick={() => { setSelezionata(a); setAperto(true); }}>{contenuto}</Button>
          : <div key={a.id} className={stile}>{contenuto}</div>;
      })}
    </div>
    {erroreSede && <p role="alert" className="text-xs text-destructive">Impossibile caricare la sede del cliente.</p>}
    {modificabile && <Button variant="ghost" size="sm" className="min-h-10 text-xs" disabled={!!erroreSede || (!!sedeClienteId && sedeInCaricamento)} onClick={() => { setSelezionata(null); setAperto(true); }}><Plus className="size-3.5"/>Registra attività</Button>}
    {modificabile && aperto && <AttivitaCommercialeDialog open={aperto} onOpenChange={setAperto} attivita={selezionata} contesto={selezionata ? {
      preventivo_id: selezionata.preventivo_id, cliente_id: selezionata.cliente_id, lead_id: selezionata.lead_id,
      opportunita_id: selezionata.opportunita_id, agente_codice: selezionata.agente_codice, store_id: selezionata.store_id,
    } : { preventivo_id: id, cliente_id: clienteId, agente_codice: agenteCodice, store_id: sede?.id ?? null }}/>}
  </RiquadroScheda>;
}