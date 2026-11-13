import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import type { BloccoConRighe } from "@/lib/preventivi-api";

const base = { blocco_id: "b", incidenza: null, qta_ordinata: 0, ricarico: null, margine: null, peso: null, riga_origine_id: null, created_at: "", updated_at: "", articolo: null, vendita: null, articolo_id: null, maggiorazione_perc: 0, segno: 1, sconto_perc: 0 };
const blocco = { id: "b", righe: [
  { ...base, id: "1", ordine: 1, tipo_riga: "articolo_singolo", articolo_codice: "FASL00H003300A0", descrizione: "LASTRA CARTONGESSO VERDE GYPSOTECH AQUA H2 BA 1200X3000 SP.13 MM", um: "MQ", quantita: 25.2, prezzo_unit: 4.167, sconti_gamma: [10], costo: 75.85, importo: 94.51 },
  { ...base, id: "2", ordine: 2, tipo_riga: "articolo_singolo", articolo_codice: "KAP28861", descrizione: "PANTALONE KAPRIOL BASIC BLU - TAGLIA L", um: "PA", quantita: 1, prezzo_unit: 23.7, sconti_gamma: [], costo: null, importo: 23.7 },
  { ...base, id: "3", ordine: 3, tipo_riga: "articolo_singolo", articolo_codice: "ITA1000108", descrizione: "ARTICOLO SENZA PREZZO", um: "NR", quantita: 2, prezzo_unit: null, sconti_gamma: [], costo: null, importo: 0 },
] } as unknown as BloccoConRighe;

export const Route = createFileRoute("/prova-righe-fm65")({ component: () => (
  <div className="mx-auto max-w-[1024px] p-2"><RigheTable blocco={blocco} preventivoId="x" fascia="A" clienteId={null} /></div>
) });
