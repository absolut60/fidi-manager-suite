import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CantiereTestata } from "@/components/preventivatore/CantiereTestata";
import { RiquadroScheda } from "@/components/preventivatore/RiquadroScheda";
import { HardHat } from "lucide-react";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
export const Route = createFileRoute("/verifica-cantiere")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient(); const [pronto, setPronto] = useState(false);
  useEffect(() => { qc.setQueryData(["chiave-mappe"], { key: null }); setPronto(true); }, [qc]);
  const prev = { id: "prev", cliente_id: "cliente", cantiere_id: "cantiere", cantiere: { id: "cantiere", nome: "Cantiere Empoli", indirizzo: "Via Roma 45", cap: "50053", citta: "Empoli", provincia: "FI" } } as unknown as PreventivoConDettagli;
  return pronto && <main className="p-3"><RiquadroScheda titolo="Cantiere" icona={HardHat} tono="verde" densita="compatta"><CantiereTestata prev={prev} modificabile onCantiere={() => {}} sedeClienteNome="Empoli"/></RiquadroScheda></main>;
}