import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { FasciaPreventivo } from "@/components/preventivatore/FasciaPreventivo";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import { PiedePreventivo } from "@/components/preventivatore/PiedePreventivo";
import { BadgeTestata } from "@/components/preventivatore/BadgeTestata";
export const Route = createFileRoute("/prova-g1")({ component: P });
const qc = new QueryClient();
const prev = { id: "x", numero: "PRV-161/26", titolo: "Pareti cartongesso uffici piano terra", tipo: "preventivo", tipo_doc: "PREVENTIVO", stato: "bozza", data: "2026-11-10", validita: "2026-11-17", agente_codice: null, filiale: "Cambiago", iva_perc: 22, note: "Consegna con gru a carico del cliente.", cliente_id: "c", cantiere_id: null, cantiere_descrizione: "Da definire", alternativa_di: null, condizione_pagamento_cod: "RB64", blocchi: [{ righe: [] }] } as never;
const cli = { codice_gestionale: "13380", ragione_sociale: "A.N. COSTRUZIONI S.R.L.", partita_iva: "01234567890", indirizzo: "Via Roma 12", cap: "20040", citta: "Cambiago", provincia: "MI", telefono: "02 1234567", cellulare: "333 1234567", email: "info@ancostruzioni.it", pec: "ancostruzioni@pec.it", codice_agente: "A01", condizione_pagamento_cod: "RB64", condizione_pagamento_desc: "RIBA 60 GG FM" } as never;
const dati = { cliente: "13380 · A.N. COSTRUZIONI S.R.L.", cantiere: "Da definire (provvisorio)", listino: "10", categoria: "Imprese – Edili", pagamento: "RIBA 60 GG FM (RB64)", validita: "17/11/2026", imponibile: 170.01, marginePerc: 20.9, margineEuro: 35.61 };
function P() {
  const [t, setT] = useState("testata");
  return <QueryClientProvider client={qc}><div className="flex flex-col gap-3 p-3">
    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">PRV-161/26</h1><BadgeTestata prev={prev} /></div>
    <FasciaPreventivo dati={dati} titolo="Pareti cartongesso uffici piano terra" onCliente={() => {}} />
    <div className="flex gap-2">{["testata", "piede"].map(x => <button key={x} id={`t-${x}`} onClick={() => setT(x)}>{x}</button>)}</div>
    {t === "testata" ? <TestataPreventivo prev={prev} cliente={cli} editMode agenti={[{ id: "A01", nome: "Mario Rossi" }] as never} principali={[]} haAlternative={false} listino="10" categoria="Imprese – Edili" sede="Cambiago" onSave={() => {}} onCliente={() => {}} onChangeCliente={() => {}} onCantiere={() => {}} modoCantiere="provvisorio" onModoCantiere={() => {}} />
      : <PiedePreventivo dati={dati} iva={37.40} totale={207.41} ivaPerc={22} sconto={0} editMode inCorso={false} onSconto={() => {}} onTestata={() => {}} />}
  </div></QueryClientProvider>;
}
