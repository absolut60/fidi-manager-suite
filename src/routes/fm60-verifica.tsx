import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ClienteAttivitaRecuperoTab } from "@/components/cliente-attivita-recupero-tab";
import { ClientePromesseTab } from "@/components/cliente-promesse-tab";
import { RecuperoStriscia } from "@/routes/_app/scadenziario";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Azione } from "@/hooks/use-azioni-recupero-cliente";
import { AuthContext } from "@/hooks/use-auth";

export const Route = createFileRoute("/fm60-verifica")({ component: Verifica });
const clienteId = "00000000-0000-4000-8000-000000000060";
const base = { cliente_id: clienteId, operatore_id: "operatore-prova", data_promessa_pagamento: null, importo_riferimento: 12000, email_oggetto: null, email_corpo_html: null, email_destinatario: null, livello_sollecito: null, created_at: "2026-11-01T09:00:00Z" };
const azioni: Azione[] = [
  { ...base, id: "nota-prova", tipo: "nota", esito: "fatto", data_azione: "2026-11-06T09:00:00Z", note: "Concordato con il cliente un aggiornamento della situazione dopo il confronto con l'amministrazione. " .repeat(8) },
  { ...base, id: "promemoria-prova", tipo: "promemoria", esito: "da_fare", data_azione: "2026-11-04T10:30:00Z", note: "Richiamare il referente amministrativo per verificare il pagamento delle fatture di ottobre e confermare la data del bonifico." },
  { ...base, id: "promessa-prova", tipo: "promessa_pagamento", esito: "fatto", stato_promessa: "attiva", data_azione: "2026-11-05T14:00:00Z", data_promessa_pagamento: "2026-11-10", note: "Promesso pagamento con bonifico entro il 10 novembre." },
  { ...base, id: "piano-prova", tipo: "nota", esito: "piano_rientro" as Azione["esito"], data_azione: "2026-11-03T14:00:00Z", note: "Definito piano di rientro in quattro rate." },
];
function Verifica() {
  const [qc] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    q.setQueryData(["azioni-recupero-cliente", clienteId], azioni);
    q.setQueryData(["nomi-utenti"], [{ id: "operatore-prova", nome: "Operatore", cognome: "di prova" }]);
    q.setQueryData(["recupero-stadio-cliente", clienteId], { stadio_sollecito: 1, stadio_data: "2026-11-04", stadio_giorni: 3 });
    q.setQueryData(["conteggio-allegati-azioni", clienteId, azioni.map((a) => a.id).sort()], { "nota-prova": 2 });
    q.setQueryData(["promesse-cliente-fatture", clienteId, ["promessa-prova"]], new Map([["promessa-prova", ["FT/123", "FT/124"]]]));
    return q;
  });
  const [aperto, setAperto] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [promesse, setPromesse] = useState(false);
  const contenuto = <><RecuperoStriscia clienteId={clienteId} pianoRientro={{pagate: 1, totali: 4}} aperto={aperto} onToggle={() => setAperto(!aperto)} />{aperto && <ClienteAttivitaRecuperoTab clienteId={clienteId} senzaRiepilogo onApriScheda={() => {}} />}</>;
  return <AuthContext.Provider value={{ session: null, user: null, profilo: null, role: "amministratore", roles: ["amministratore"], hasRole: () => true, hasAnyRole: () => true, loading: false, aggiornaProfilo: async () => {} }}><QueryClientProvider client={qc}><main className="mx-auto max-w-6xl space-y-4 p-4">
    <h1 className="text-xl font-semibold">Scadenziario · Cliente di prova</h1>
    <div className="flex flex-wrap gap-2"><Button onClick={() => setSheet(true)}>Apri Sheet</Button><Button variant="outline" onClick={() => setPromesse(!promesse)}>Scheda Promesse</Button></div>
    {promesse ? <ClientePromesseTab clienteId={clienteId} /> : <section className="space-y-4 border-t pt-4">{contenuto}</section>}
    <Sheet open={sheet} onOpenChange={setSheet}><SheetContent side="bottom" className="h-[90dvh] overflow-y-auto p-4"><SheetHeader className="pr-8 text-left"><SheetTitle>Cliente di prova con ragione sociale lunga</SheetTitle><SheetDescription>5003 · Negozio di prova</SheetDescription></SheetHeader><div className="mt-4 space-y-4">{contenuto}</div></SheetContent></Sheet>
  </main></QueryClientProvider></AuthContext.Provider>;
}