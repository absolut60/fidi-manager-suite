import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import type { BloccoConRighe } from "@/lib/preventivi-api";
export const Route = createFileRoute("/prova-um")({ component: P });
const base = { blocco_id: "b1", tipo_riga: "articolo_singolo", segno: 1, descrizione: "LASTRA IDRO H2 BA13 1200X3000 KNAUF", um: "MQ", quantita: 40, incidenza: 2, prezzo_unit: 4.167, sconti_gamma: [10], maggiorazione_perc: 0, sconto_perc: 0, costo: 120.4, importo: 150.01, peso: null, peso_gamma_unit: null, articolo_codice: "FASL00H003300A0", unita_gamma: { um: "MQ", um2: "NR", fattore_conversione: 3.6 } };
function P() {
  const blocco = { id: "b1", preventivo_id: "p1", quantita_base: 20, righe: [
    { ...base, id: "r1", ordine: 10, um_scelta: "um1" },
    { ...base, id: "r2", ordine: 20, um_scelta: "um2" },
    { ...base, id: "r3", ordine: 30, um_scelta: "um1", articolo_codice: "KAP28861", descrizione: "GUANTI KAPRIOL", um: "NR", quantita: 1, incidenza: 0.05, prezzo_unit: 26.33, importo: 23.7, costo: 18, unita_gamma: { um: "NR", um2: null, fattore_conversione: null } },
  ] } as unknown as BloccoConRighe;
  return <div className="mx-auto max-w-[1800px] p-2"><div className="rounded border"><RigheTable blocco={blocco} preventivoId="p1" fascia="A" clienteId="c1" /></div></div>;
}
