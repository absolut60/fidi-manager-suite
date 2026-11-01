// TEMPORANEO: solo per screenshot di verifica con dati finti. Da cancellare.
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertFidiContenuto } from "@/routes/_app/alert-fidi";

export const Route = createFileRoute("/prova-alert-temp")({ component: P });
const cl = (id: string, nome: string, fido: number, rischio: number) => ({ id, codice_gestionale: "C" + id, ragione_sociale: nome, store_id: "s", partita_iva: "0123456789" + id.length, codice_agente: null, totale_rischio: rischio, fido_gestionale: fido, stores: { nome: "SEDE DI LISSONE" } });
const al = (id: string, c: any, cons: number, ord: number) => ({ id, cliente_id: c.id, tipo: "consumo", livello: 1, stato: "aperto", aperto_il: "2026-10-28T08:00:00Z", fido_gamma: c.fido_gestionale, esposizione: c.totale_rischio, ordini_aperti: ord, consumo: cons, fido_proposto: 0, richiesta_id: null, riproponi_dal: null, cliente: c, richiesta: null, richiesta_attiva: null, decisione: null });
const A = cl("a", "BASIR ICONOGRAFIA COSTRUZIONI E RISTRUTTURAZIONI EDILI SOCIETÀ A RESPONSABILITÀ LIMITATA SEMPLIFICATA", 5000, 4500);
const B = cl("b", "MA.GI. EDILIZIA SRLS", 20000, 17144);
const C = cl("c", "ROSSI MARIO SRL", 10000, 8700);
const t = (o: any) => ({ fido_attuale: 0, fido_proposto: 0, esposizione_corrente: 0, ordini_aperti: 0, segnalazioni: [], spiegazione: "Acquisto medio 2.300 € al mese.", ...o });
function P() {
  const qc = useQueryClient();
  useState(() => {
    const k = "a,b,c";
    qc.setQueryDefaults(["alert-fidi-aperti"], { staleTime: Infinity });
    qc.setQueryDefaults(["revisione-fidi-lasciati-alert"], { staleTime: Infinity });
    qc.setQueryData(["alert-fidi-aperti"], [al("1", A, 0.9, 0), al("2", B, 0.86, 4120), al("3", C, 0.87, 0)]);
    qc.setQueryData(["fido-teorico-alert", k], new Map<string, any>([
      ["a", t({ regola_applicata: "calcolo", fido_attuale: 5000, fido_proposto: 8000, esposizione_corrente: 4500 })],
      ["b", t({ regola_applicata: "scaduto_non_incassato", fido_attuale: 20000, esposizione_corrente: 17144, ordini_aperti: 4120, segnalazioni: ["scaduto_non_incassato", "ordini_oltre_fido"] })],
      ["c", t({ regola_applicata: "calcolo", fido_attuale: 10000, fido_proposto: 12000, esposizione_corrente: 8700 })],
    ]));
    qc.setQueryData(["fido-teorico-per-richiesta-alert", "u", k], new Map([["a", 8000], ["b", 0], ["c", 12000]]));
    qc.setQueryData(["decisioni-protette-alert", k], new Map());
    qc.setQueryData(["revisione-fidi-lasciati-alert", k], new Map());
    qc.setQueryData(["agenti", "all"], []);
    return true;
  });
  return <div className="p-3"><AlertFidiContenuto userId="u" puoProporre /></div>;
}
