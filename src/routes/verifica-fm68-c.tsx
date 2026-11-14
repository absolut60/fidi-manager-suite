import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CantiereTestata } from "@/components/preventivatore/CantiereTestata";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
import { RiquadroScheda } from "@/components/preventivatore/RiquadroScheda";
import { Button } from "@/components/ui/button";
import { HardHat } from "lucide-react";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";

export const Route = createFileRoute("/verifica-fm68-c")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState(false);
  useState(() => { qc.setQueryData(["chiave-mappe"], ""); qc.setQueryData(["agenti-lookup"], []); });
  const prev = { id: "preventivo-simulato", cliente_id: "11111111-1111-4111-8111-111111111111", cantiere_id: id, cantiere: id ? { id, nome: "Cantiere prova FM68", provvisorio: true } : null } as unknown as PreventivoConDettagli;
  return <main className="p-4 space-y-4">
    <h1>Preventivo simulato FM68</h1>
    <RiquadroScheda titolo="Cantiere" icona={HardHat} tono="verde" densita="compatta">
      <CantiereTestata prev={prev} modificabile onCantiere={setId} clienteEtichetta="2906 · Impresa di prova" />
    </RiquadroScheda>
    <Button onClick={() => setNuovo(true)}>Nuovo preventivo</Button>
    <NuovoPreventivoDialog open={nuovo} onOpenChange={setNuovo}/>
  </main>;
}