import { createFileRoute } from "@tanstack/react-router";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import type { BloccoConRighe } from "@/lib/preventivi-api";

const blocco = { id: "verifica", righe: [
  { id: "lastra", tipo_riga: "articolo_singolo", articolo_codice: "FASL00H003300A0", articolo_id: null, descrizione: "LASTRA CARTONGESSO VERDE", quantita: 40, prezzo_unit: 4.167, sconti_gamma: [10], costo: 120.4, um: "MQ", segno: 1, peso_gamma_unit: null, articolo: null },
  { id: "strati", tipo_riga: "da_kit", articolo_codice: null, articolo_id: null, descrizione: "STRATI", quantita: 10, prezzo_unit: null, costo: null, articolo: null },
] } as unknown as BloccoConRighe;
export const Route = createFileRoute("/verifica-fm65")({ component: () => <main className="p-3"><h1>Verifica FM65</h1><RigheTable blocco={blocco} preventivoId="verifica" fascia="A" clienteId={null} readOnly /></main> });