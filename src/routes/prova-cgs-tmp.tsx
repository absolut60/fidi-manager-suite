import { createFileRoute } from "@tanstack/react-router";
import { CardScore } from "@/components/cliente-cerved-tab";
const s = (v: number, cat: string, desc: string, sem: string) => [
  { codice_score: "CGS", descrizione_score: null, valore: v, categoria_codice: null, categoria_descrizione: desc, pd: 0.02671, trend_codice: null, trend_descrizione: "Stabile" },
  { codice_score: "SEM_CGS", descrizione_score: null, valore: null, categoria_codice: sem, categoria_descrizione: cat, pd: null, trend_codice: null, trend_descrizione: null },
];
export const Route = createFileRoute("/prova-cgs-tmp")({ component: () => (
  <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-3">
    {[s(36, "", "Media", "V"), s(56, "", "Media", "V"), s(22, "", "Bassa", "R")].map((x, i) => (
      <div key={i} id={`c${i}`} className="rounded border bg-card p-4"><CardScore scores={x as never} fido={null} fidoMade={null} /></div>
    ))}
  </div>) });
