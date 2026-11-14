import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import type { DatiClientePreventivo, PreventivoConDettagli } from "@/lib/preventivi-api";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/verifica-riquadri-temporanea")({ component: Verifica });
const cid = "11111111-1111-4111-8111-111111111111", sid = "22222222-2222-4222-8222-222222222222", pid = "33333333-3333-4333-8333-333333333333";
function Verifica() {
  const qc = useQueryClient();
  const [scenario, setScenario] = useState(0);
  const [clienteAperto, setClienteAperto] = useState(false);
  const geo = { id: cid, nome: "Cantiere Empoli", indirizzo: "Via Roma 45", cap: "50053", citta: "Empoli", provincia: "FI", lat: 43.718027, lng: 10.949182, sede_piu_vicina_id: "vicina", sede_piu_vicina_km: 329.3, sede_piu_vicina_min: 202, created_by: null };
  const sedi = [{ id: "vicina", nome: "SEDE DI CINISELLO BALSAMO", lat: 45, lng: 9 }, { id: sid, nome: "SEDE DI CASOREZZO", lat: 45.5169976, lng: 8.9090398 }];
  const clienteId = scenario === 1 ? "vicina" : sid;
  for (const key of [["cantiere-preventivo-posizione",cid],["sedi-cantiere-preventivo","vicina",clienteId],["attivita-commerciale","preventivo",pid],["preventivi-note",pid],["chiave-mappe"],["sede-attivita-preventivo",clienteId]]) qc.setQueryDefaults(key, { staleTime: Infinity });
  qc.setQueryData(["cantiere-preventivo-posizione",cid],geo);
  qc.setQueryData(["sedi-cantiere-preventivo","vicina",clienteId],sedi);
  qc.setQueryData(["distanza-cantiere-sede",cid,sid,geo.lat,geo.lng],{km:344.711,minuti:12782/60});
  qc.setQueryData(["sede-attivita-preventivo",clienteId],{id:clienteId});
  qc.setQueryData(["attivita-commerciale","preventivo",pid],[]);
  qc.setQueryData(["chiave-mappe"],null);
  const prev = { id:pid, cliente_id: null, cantiere:geo, cantiere_id:cid, tipo:'preventivo', stato:'bozza', tipo_doc:'PREVENTIVO', numero:'PRV-001', titolo:'Fornitura Empoli', data:'2026-11-14', iva_perc:22 } as unknown as PreventivoConDettagli;
  const cliente = { ragione_sociale:'Impresa Rossi S.r.l.', codice_gestionale:'12345', tipo_soggetto:'azienda', partita_iva:'01234567890', codice_fiscale:'01234567890', indirizzo:'Via Firenze 12', citta:'Empoli', cap:'50053', provincia:'FI', telefono:'', cellulare:'', email:'', pec:'' } as DatiClientePreventivo;
  return <main className="mx-auto max-w-6xl p-3"><Button onClick={()=>setScenario((scenario+1)%3)}>Scenario {scenario}</Button>{clienteAperto&&<p>Cliente aperto</p>}<TestataPreventivo prev={prev} cliente={cliente} modificabile={scenario!==2} statoEditabile={false} agenti={[]} principali={[]} haAlternative={false} listino="A" categoria="Edilizia" sede={scenario===1?sedi[0].nome:sedi[1].nome} sedeClienteId={clienteId} onSave={()=>{}} onCliente={()=>setClienteAperto(true)} onChangeCliente={()=>{}} onCantiere={()=>{}}/></main>;
}