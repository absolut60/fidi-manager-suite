import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
export const Route = createFileRoute("/prova-corpo-tmp")({ component: P });
const riga = (id: string, o: number, cod: string, desc: string, pz: number, costo: number) => ({ id, blocco_id: "b", ordine: o, tipo_riga: "articolo_singolo", segno: 1, quantita: 4, prezzo_unit: pz, sconti_gamma: [10], costo_unit: costo, costo: costo*4, descrizione: desc, articolo_codice: cod, um: "PZ", sconto_perc: 0, maggiorazione_perc: 0, stampabile: true, leva_prezzo: null, ricarico: null, peso_gamma_unit: 1 } as any);
function P() {
  const linea = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("l") ?? "showroom";
  const blocco = { id: "b", quantita_base: 10, righe: [riga("r1", 1, "ART001", "Lavabo sospeso bianco 60 cm", 250, 120), riga("r2", 2, "ART002", "Miscelatore monocomando cromato", 180, 90)] } as any;
  return <div className="p-4"><RigheTable blocco={blocco} preventivoId="x" fascia={"A" as any} clienteId={null} linea={linea} condizioniPrezzi={{ cliente_id: null, listino_rif: 1, macrocategoria_rif: null, categoria_rif: null, store_id: null }} /></div>;
}
