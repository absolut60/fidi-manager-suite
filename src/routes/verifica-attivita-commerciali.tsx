import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AttivitaCommercialeDialog } from "@/components/attivita-commerciale-dialog";
import { Button } from "@/components/ui/button";
import { luogoAttivita, type AttivitaRow } from "@/lib/attivita-commerciale";

export const Route = createFileRoute("/verifica-attivita-commerciali")({ component: Verifica });
const sede = "10000000-0000-0000-0000-000000000001";
const esempio: AttivitaRow = { id: "20000000-0000-0000-0000-000000000001", cliente_id: "30000000-0000-0000-0000-000000000001", lead_id: null, opportunita_id: null, tipo: "visita", titolo: "Sopralluogo attività storica", descrizione: null, data_pianificata: null, data_svolgimento: null, completata: false, esito: "Da richiamare", agente_codice: null, operatore_id: null, store_id: sede, luogo: "Magazzino storico, ingresso lato cortile", indirizzo: null, cap: null, citta: null, provincia: null, sede_riferimento_id: "10000000-0000-0000-0000-000000000002", note: "Nota conservata", created_at: "2026-11-14T12:00:00Z" };
function Verifica() {
  const qc = useQueryClient();
  useEffect(() => { qc.setQueryData(["chiave-mappe"], "simulazione"); document.body.dataset.provaPronta = "true"; }, [qc]);
  const [modo, setModo] = useState<"crea" | "modifica" | "calendario" | null>(null);
  const [salvata, setSalvata] = useState<AttivitaRow | null>(null);
  return <div className="p-4 space-y-3">
    <Button onClick={() => setModo("crea")}>Crea dal contesto</Button>
    <Button onClick={() => setModo("calendario")}>Crea dal calendario</Button>
    <Button onClick={() => setModo("modifica")}>Modifica storica</Button>
    {salvata && <p data-testid="luogo-salvato">{luogoAttivita(salvata)}</p>}
    <AttivitaCommercialeDialog open={modo !== null} onOpenChange={(o) => { if (!o) setModo(null); }} attivita={modo === "modifica" ? esempio : null}
      contesto={modo === "crea" ? { cliente_id: esempio.cliente_id, store_id: sede } : modo === "modifica" ? { cliente_id: esempio.cliente_id, store_id: null } : {}}
      conSelettoreSoggetto={modo === "calendario"}
      onSaved={async () => { const { supabase } = await import("@/integrations/supabase/client"); const { data } = await supabase.from("attivita_commerciale").select("*, sede_riferimento:stores!attivita_commerciale_sede_riferimento_id_fkey(nome)").maybeSingle(); if (data) setSalvata(data as AttivitaRow); }} />
  </div>;
}