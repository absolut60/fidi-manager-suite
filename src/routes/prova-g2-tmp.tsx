import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SchedaFornitore, type TabSchedaFornitore } from "@/components/fornitori/SchedaFornitore";
export const Route = createFileRoute("/prova-g2-tmp")({ component: P });
const f: any = { id: "f1", ragione_sociale: "EDILFORNITURE ESEMPIO SRL", codice_gestionale: "F001", partita_iva: "01234567890", macrocategoria_cod: "01", macrocategoria_desc: "Materiali edili", condizione_pagamento_desc: "RiBa 60 gg", condizione_pagamento_cod: "RB60", puo_vedere_articoli: true, puo_modificare_note: true, n_articoli: 1240, n_preferenziale: 312, clienti: [], telefono: "0521 123456", email: "info@esempio.it", note: "Nota di prova" };
const righe = [
  { id: "a1", fornitore_id: "f1", tipo: "telefonata", origine: "manuale", data_attivita: "2026-11-10T09:30:00Z", oggetto: "Richiesta listino 2027", corpo: "Chiamato il referente per il nuovo listino.", esito: "Invio entro fine mese", destinatari: null, stato: "registrata", errore: null, creato_da: "u", operatore: "Andrea Giani", n_allegati: 1 },
  { id: "a2", fornitore_id: "f1", tipo: "email", origine: "invio", data_attivita: "2026-11-08T14:00:00Z", oggetto: "Ordine settimanale", corpo: "Testo email inviata", esito: null, destinatari: ["ordini@esempio.it"], stato: "errore", errore: "Casella piena", creato_da: "u", operatore: "Mario Rossi", n_allegati: 0 },
];
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } } });
qc.setQueryData(["attivita-fornitore", "f1", []], { pages: [{ rows: righe, total: 2 }], pageParams: [0] });
qc.setQueryData(["attivita-fornitore", "f1", "ultima"], { pages: [{ rows: righe.slice(0, 1), total: 2 }], pageParams: [0] });
function P() {
  const [tab, setTab] = useState<TabSchedaFornitore>("riepilogo");
  return <QueryClientProvider client={qc}><div className="mx-auto max-w-7xl p-3 sm:p-6"><SchedaFornitore fornitore={f} tab={tab} onTabChange={setTab} statoArticoli={{ ricerca: "", preferenziali: false, pagina: 1, cambiaRicerca() {}, cambiaPreferenziali() {}, cambiaPagina() {} }} /></div></QueryClientProvider>;
}
