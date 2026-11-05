import { createFileRoute } from "@tanstack/react-router";
import { CardScore } from "@/components/cliente-cerved-tab";
const mk = (v: number, cat: string, sem: string) => [
  { codice_score: "CGS", descrizione_score: "", valore: v, categoria_codice: "", categoria_descrizione: cat, pd: 0.02671, trend_descrizione: "Stabile" },
  { codice_score: "SEM_CGS", descrizione_score: "", valore: null, categoria_codice: sem, categoria_descrizione: "", pd: null, trend_descrizione: null },
] as any;
export const Route = createFileRoute("/tmp-gauge")({ component: () => (
  <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 p-4 md:grid-cols-2">
    {[[56,"MEDIA","V"],[36,"BASSA","V"],[10,"MOLTO BASSA","R"],[95,"MOLTO ALTA","V"]].map(([v,c,s]) => (
      <CardScore key={v as number} scores={mk(v as number, c as string, s as string)} fido={null} fidoMade={50000} />))}
  </div>) });
