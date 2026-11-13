import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RiepilogoArticoloDialog } from "@/components/preventivatore/RiepilogoArticoloDialog";
export const Route = createFileRoute("/prova-riepilogo")({ component: P });
function P() {
  const [o, setO] = useState(false); const [n, setN] = useState(0);
  return <div className="p-8" onInputCapture={() => setN((x) => x + 1)}>
    <fieldset disabled><span role="button" tabIndex={0} aria-label="Riepilogo articolo riga 1" onClick={(e) => { e.stopPropagation(); setO(true); }}>i</span><button>btn</button></fieldset>
    <p id="n">{n}</p>
    <RiepilogoArticoloDialog open={o} onOpenChange={setO} clienteId="eb8cd8a7-d64a-4f73-85c9-cc9457d32fcd" codice="FASL00H003300A0"
      riga={{ quantita: 40, prezzo_unit: 4.167, sconti_gamma: [10], um: "MQ", um_scelta: "um2" } as never} calc={{ importo: 150.01, margine_perc: 19.7 }} />
  </div>;
}
