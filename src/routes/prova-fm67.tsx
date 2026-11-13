import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import { FasciaPreventivo } from "@/components/preventivatore/FasciaPreventivo";
export const Route = createFileRoute("/prova-fm67")({ component: P });
const base = { blocco_id: "b", preventivo_id: "p", segno: 1, sconto_perc: 0, maggiorazione_perc: 0, quantita: 10, incidenza: null, costo_unit: 5, prezzo_unit: 12.5, um: "MQ", articolo_id: null, sconti_gamma: [17, 5], peso_gamma_unit: 2 } as any;
const righe = [
  { ...base, id: "1", ordine: 1, tipo_riga: "articolo", articolo_codice: "KNA-LASTRA-GKB-12,5-1200", descrizione: "LASTRA IN CARTONGESSO KNAUF GKB STANDARD SP. 12,5 MM 1200X3000 BORDO ASSOT", unita_gamma: { um1: "MQ", um2: "PZ", fattore: 3.6 } },
  { ...base, id: "2", ordine: 2, tipo_riga: "manuale", articolo_codice: null, descrizione: "Trasporto in cantiere", um: "CAD" },
  { ...base, id: "3", ordine: 3, tipo_riga: "nota", articolo_codice: null, descrizione: "Nota: consegna entro venerdì", prezzo_unit: null },
];
function P() {
  return <div className="space-y-4 p-4"><div id="fascia">{(FasciaPreventivo as any).length >= 0 && null}</div>
    <RigheTable blocco={{ id: "b", quantita_base: 40, righe } as any} preventivoId="p" fascia={"B" as any} clienteId={null} /></div>;
}
