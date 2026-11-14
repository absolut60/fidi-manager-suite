import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { ModuloConsensoPrivacy } from "@/components/modulo-consenso-privacy";

const Contatto = lazy(async () => {
  const path = "/src/components/verifica-contatto-giro3.tsx";
  const module = await import(/* @vite-ignore */ path);
  return { default: module.EditContattoDialog };
});
export const Route = createFileRoute("/verifica-indirizzi-giro3")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  const senzaChiave = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).has("manuale");
  qc.setQueryData(["chiave-mappe"], senzaChiave ? null : "simulazione-google");
  const privacy = typeof window !== "undefined" && window.location.search.includes("privacy");
  return <ClientOnly><Suspense fallback={<p>Caricamento</p>}>
    {privacy ? <div className="mx-auto max-w-2xl p-4"><ModuloConsensoPrivacy modalita="flag" valoriIniziali={{ nome: "Mario", cognome: "Rossi", email: "mario@example.test" }} onSubmit={(p) => { document.body.dataset.residenzaSalvata = p.dichiarante.residenza; }} /></div>
      : <Dialog open><Contatto contatto={{ id: "simulato", cliente_id: "simulato", nome: "Mario", cognome: "Rossi" }} onClose={() => {}} /></Dialog>}
  </Suspense></ClientOnly>;
}