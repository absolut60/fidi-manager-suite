// TEMPORANEO FM82: riga manuale Sistema MADE. Da rimuovere.
import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import type { BloccoConRighe } from "@/lib/preventivi-api";
const base = { blocco_id: "b1", articolo_id: null, articolo: null, um: "PZ", quantita: 2, sconto_perc: 0, maggiorazione_perc: 0, segno: 1, stampabile: true, leva_prezzo: null, peso: 0, peso_gamma_unit: 0, unita_gamma: null, um_scelta: "um1", bene_significativo: false, fonte_prezzo: null, ricarico: null };
const righe = [
  { ...base, id: "r1", ordine: 10, tipo_riga: "manuale", articolo_codice: null, descrizione: "Rubinetto in definizione", codice_articolo_fornitore: "R60NAVAU", prezzo_unit: 100, vendita: 100, costo: 60, sconti_gamma: [] },
  { ...base, id: "r2", ordine: 20, tipo_riga: "manuale", articolo_codice: null, descrizione: "Riga manuale vuota", codice_articolo_fornitore: null, prezzo_unit: null, vendita: null, costo: null, sconti_gamma: [] },
  { ...base, id: "r3", ordine: 30, tipo_riga: "articolo_singolo", articolo_codice: "GOLR60NAVAU", descrizione: "Articolo Gamma", codice_articolo_fornitore: null, prezzo_unit: 50, vendita: 50, costo: 30, sconti_gamma: [10] },
];
export const Route = createFileRoute("/fm82-prova")({ component: () => (
  <div className="p-2"><RigheTable blocco={{ id: "b1", righe } as unknown as BloccoConRighe} preventivoId="p1" fascia={"A" as never}
    clienteId={null} condizioniPrezzi={{ listino_rif: 1 } as never} linea="sistema_made" /></div>) });
