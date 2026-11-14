import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CantiereTestata } from "@/components/preventivatore/CantiereTestata";
import { Button } from "@/components/ui/button";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
export const Route = createFileRoute("/verifica-routes-temporanea")({ component: Verifica });
const cid = "11111111-1111-4111-8111-111111111111";
const sid = "22222222-2222-4222-8222-222222222222";
function Verifica() {
  const qc = useQueryClient();
  const [stessa, setStessa] = useState(false);
  const geo = { id: cid, nome: "Cantiere Empoli", indirizzo: "Via del Cantiere 10", cap: "50053", citta: "Empoli", provincia: "FI", lat: 43.718027, lng: 10.949182, sede_piu_vicina_id: "vicina", sede_piu_vicina_km: 329.3, sede_piu_vicina_min: 202 };
  const sedi = [{ id: "vicina", nome: "Sede più vicina", lat: 45, lng: 9 }, { id: sid, nome: "SEDE DI CASOREZZO", lat: 45.5169976, lng: 8.9090398 }];
  qc.setQueryDefaults(["cantiere-preventivo-posizione"], { staleTime: Infinity });
  qc.setQueryDefaults(["sedi-cantiere-preventivo"], { staleTime: Infinity });
  qc.setQueryData(["cantiere-preventivo-posizione", cid], geo);
  const nome = stessa ? "Sede più vicina" : "SEDE DI CASOREZZO";
  qc.setQueryData(["sedi-cantiere-preventivo", "vicina", nome], sedi);
  qc.setQueryData(["distanza-cantiere-sede", cid, sid, geo.lat, geo.lng], { km: 344.711, minuti: 12782 / 60 });
  return <main className="mx-auto max-w-6xl p-4"><Button onClick={() => setStessa(!stessa)}>Cambia scenario</Button><h1>Cantiere</h1><CantiereTestata prev={{ cantiere: geo, cantiere_id: cid } as unknown as PreventivoConDettagli} modificabile={false} onCantiere={() => {}} sedeClienteNome={nome}/></main>;
}