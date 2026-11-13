import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FasciaPreventivo } from "@/components/preventivatore/FasciaPreventivo";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import type { BloccoConRighe } from "@/lib/preventivi-api";
export const Route = createFileRoute("/prova-r2b")({ component: P });
function P() {
  const [um] = useState(() => typeof window !== "undefined" && location.search.includes("um2") ? "um2" : "um1");
  const riga = { id: "r1", blocco_id: "b1", tipo_riga: "articolo_singolo", ordine: 10, segno: 1, articolo_codice: "FASL00H003300A0", descrizione: "LASTRA IDRO H2 BA13 1200X3000 KNAUF", um: "MQ", um_scelta: um, quantita: 40, incidenza: 2, prezzo_unit: 4.167, sconti_gamma: [10], maggiorazione_perc: 0, sconto_perc: 0, costo: 120.4, importo: 150.01, peso: null, peso_gamma_unit: null, unita_gamma: { um: "MQ", um2: "NR", fattore_conversione: 3.6 } };
  const blocco = { id: "b1", preventivo_id: "p1", quantita_base: 20, um_base: "mq", righe: [riga] } as unknown as BloccoConRighe;
  return <div className="mx-auto max-w-[1800px] space-y-3 p-2">
    <FasciaPreventivo onCliente={() => {}} dati={{ cliente: "13380 · A.N. COSTRUZIONI SRL", cantiere: "Da definire (provvisorio)", listino: "30 – Listino rivenditori", categoria: "IMPRESE EDILI – Costruzioni generali", pagamento: "RB64 – R.B. 90 gg d.f. f.m. 15ms", validita: "20/11/2026", imponibile: 170.01, marginePerc: 20.9, margineEuro: 35.61 }} />
    <div className="rounded border"><RigheTable blocco={blocco} preventivoId="p1" fascia="A" clienteId="c1" /></div>
  </div>;
}
