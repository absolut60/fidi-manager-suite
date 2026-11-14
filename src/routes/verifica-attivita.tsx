import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AttivitaPreventivo } from "@/components/preventivatore/AttivitaPreventivo";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/verifica-attivita")({ component: Verifica });
function Verifica() {
  const [scrivi, setScrivi] = useState(true);
  return <main className="p-3"><Button onClick={() => setScrivi(v => !v)}>Cambia sola lettura</Button><section className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]"><AttivitaPreventivo id="00000000-0000-4000-8000-000000000161" clienteId="00000000-0000-4000-8000-000000000162" agenteCodice="A01" sedeNome="Empoli" modificabile={scrivi}/></section></main>;
}