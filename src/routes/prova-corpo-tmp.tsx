import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
export const Route = createFileRoute("/prova-corpo-tmp")({ component: P });
function P() {
  const blocco = { id: "b", quantita_base: 0, righe: [{ id: "r1", blocco_id: "b", ordine: 1, tipo_riga: "manuale", segno: 1, quantita: 2, prezzo_unit: 300, sconti_gamma: [], costo_unit: 150, costo: 300, descrizione: "Box doccia su misura", articolo_codice: null, um: "PZ", sconto_perc: 0, stampabile: true } as any] } as any;
  return <div className="p-4"><RigheTable blocco={blocco} preventivoId="x" fascia={"A" as any} clienteId={null} linea="showroom" condizioniPrezzi={{ cliente_id: null, listino_rif: null, macrocategoria_rif: null, categoria_rif: null, store_id: null }} /></div>;
}
