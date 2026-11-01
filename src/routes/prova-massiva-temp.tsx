// TEMPORANEO: solo per screenshot di verifica con dati finti. Da cancellare.
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ProposteFidoMassivoDialog } from "@/components/proposta-fido-massiva-dialog";

export const Route = createFileRoute("/prova-massiva-temp")({ component: P });

const C = [
  { id: "a", ragione_sociale: "BASIR ICONOGRAFIA COSTRUZIONI E RISTRUTTURAZIONI EDILI SOCIETÀ A RESPONSABILITÀ LIMITATA SEMPLIFICATA", partita_iva: "01234567890", store_id: "s", stores: { nome: "SEDE DI LISSONE" }, fido_gestionale: 5000, totale_rischio: 3000 },
  { id: "b", ragione_sociale: "MA.GI. EDILIZIA SRLS", partita_iva: "01234567891", store_id: "s", stores: { nome: "SEDE DI CASOREZZO" }, fido_gestionale: 20000, totale_rischio: 17144 },
  { id: "c", ragione_sociale: "ROSSI MARIO SRL", partita_iva: "01234567892", store_id: "s", stores: { nome: "SEDE DI VERCELLI" }, fido_gestionale: 10000, totale_rischio: 6000 },
];
const t = (o: any) => ({ fido_attuale: 0, fido_proposto: 0, esposizione_corrente: 0, ordini_aperti: 0, segnalazioni: [], scostamento: 0, acquisto_mensile: 2300, spiegazione: "Acquisto medio 2.300 € al mese, ciclo 60 giorni.", ...o });
function P() {
  const qc = useQueryClient();
  const [ok] = useState(() => {
    const k = "a,b,c";
    qc.setQueryData(["fido-teorico-massivo", k], new Map<string, any>([
      ["a", t({ regola_applicata: "calcolo", fido_attuale: 5000, fido_proposto: 8000, esposizione_corrente: 3000 })],
      ["b", t({ regola_applicata: "scaduto_non_incassato", fido_attuale: 20000, fido_proposto: 0, esposizione_corrente: 17144, ordini_aperti: 4120, segnalazioni: ["scaduto_non_incassato", "ordini_oltre_fido"], scaduto_oltre: 3200, scaduto_oltre_giorni: 75 })],
      ["c", t({ regola_applicata: "calcolo", fido_attuale: 10000, fido_proposto: 10000, esposizione_corrente: 6000 })],
    ]));
    qc.setQueryData(["fido-teorico-per-richiesta", "u", k], new Map([["a", 8000], ["b", 0], ["c", 10000]]));
    qc.setQueryData(["extra-fido-protetti-massivo", k], new Map());
    qc.setQueryData(["alert-fidi-aperti-massivo", k], []);
    qc.setQueryData(["soglia-consumo-fido"], 0.8);
    qc.setQueryData(["richieste-in-corso-massivo", k], new Map());
    qc.setQueryData(["condizioni-clienti-massivo", k], new Map());
    return true;
  });
  return ok ? <ProposteFidoMassivoDialog open onOpenChange={() => {}} selectedRows={C as any} userId="u" onSuccess={() => {}} onRemove={() => {}} mostraSempre={new Set(["a", "b", "c"]) as any} /> : null;
}
