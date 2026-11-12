import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AttivitaFornitoreTab, chiaveAttivita } from "@/components/fornitori/AttivitaFornitore";
const F = "b9036c2d-af3c-4435-a6b4-ab8670f999d9";
const rows = [
  { id: "1", fornitore_id: F, tipo: "telefonata", origine: "manuale", data_attivita: "2026-11-12T09:30:00Z", oggetto: "Ritardo consegna cartongesso", corpo: "Sentito Marco in ufficio ordini: il camion parte domani mattina. ".repeat(6), esito: "Consegna confermata per venerdì", destinatari: null, stato: "registrata", errore: null, creato_da: "u", operatore: "Andrea Giani", n_allegati: 2 },
  { id: "2", fornitore_id: F, tipo: "email", origine: "invio", data_attivita: "2026-11-10T14:05:00Z", oggetto: "Richiesta listino 2027", corpo: "Buongiorno, chiediamo il nuovo listino.", esito: null, destinatari: ["ordini@viglietta.it", "amministrazione@viglietta.it"], stato: "inviata", errore: null, creato_da: "u", operatore: "Andrea Giani", n_allegati: 0 },
  { id: "3", fornitore_id: F, tipo: "incontro", origine: "manuale", data_attivita: "2026-11-03T08:00:00Z", oggetto: "Visita agente in sede", corpo: null, esito: null, destinatari: null, stato: "registrata", errore: null, creato_da: null, operatore: null, n_allegati: 0 },
];
export const Route = createFileRoute("/verifica-g2")({ component: () => { const qc = useQueryClient(); useState(() => { qc.setQueryDefaults(chiaveAttivita(F), { staleTime: Infinity }); qc.setQueryData([...chiaveAttivita(F), []], { pages: [{ rows, total: 3 }], pageParams: [0] }); return 0; }); return <div className="mx-auto max-w-5xl p-3"><AttivitaFornitoreTab fornitoreId={F} puoScrivere /></div>; } });
