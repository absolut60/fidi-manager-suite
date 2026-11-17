// TEMPORANEO FM81: banco di prova del corpo preventivo con righe finte. Da rimuovere.
import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTableOrigFm81";
import type { BloccoConRighe } from "@/lib/preventivi-api";

const art = (i: number, cod: string, desc: string, q: number, p: number, c: number) => ({
  id: `r${i}`, blocco_id: "b1", tipo_riga: "articolo_singolo", ordine: i * 10, articolo_codice: cod, articolo_id: null, articolo: null,
  descrizione: desc, um: "PZ", quantita: q, prezzo_unit: p, vendita: p, costo: c, sconto_perc: 0, sconti_gamma: [20, 10], maggiorazione_perc: 0,
  segno: 1, stampabile: true, ricarico: 35, leva_prezzo: null, peso: 0, peso_gamma_unit: 0, unita_gamma: null, um_scelta: "um1",
  codice_articolo_fornitore: null, bene_significativo: false, fonte_prezzo: null,
});
const sub = (i: number) => ({ ...art(i, "", "Sotto-totale", 0, 0, 0), tipo_riga: "sotto_totale", articolo_codice: null });
const righe = [
  art(1, "NEW69310.21.018", "Miscelatore lavabo cromato con scarico automatico serie Lusso", 2, 124.9, 80.2),
  art(2, "NEW69310.21.019", "Miscelatore bidet cromato", 2, 118.5, 76.1),
  art(3, "GRH-33242002", "Colonna doccia termostatica Euphoria 260", 1, 689, 442.3),
  sub(4),
  art(5, "VLB-4321A001", "Vaso sospeso rimless bianco opaco con sedile rallentato", 1, 412.4, 268.9),
  art(6, "VLB-4321A002", "Bidet sospeso bianco opaco", 1, 298, 194.5),
  art(7, "CER-88110", "Piatto doccia in resina 80x120 effetto pietra antracite", 1, 535, 349.9),
  sub(8),
];
export const Route = createFileRoute("/fm81-orig")({ component: () => (
  <div className="p-2"><RigheTable blocco={{ id: "b1", righe } as unknown as BloccoConRighe} preventivoId="p1" fascia={"A" as never}
    clienteId={null} condizioniPrezzi={{ listino_rif: 1 } as never} linea="showroom" /></div>
) });
