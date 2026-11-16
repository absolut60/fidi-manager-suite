import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { VistaCerved, type DatiCervedCliente } from "@/components/cliente-cerved-tab";
import { SezioneCervedCompatta } from "@/components/cerved/sezione-cerved-compatta";

export const Route = createFileRoute("/verifica-cerved-temporanea")({
  component: Verifica,
});
function Verifica() {
  const [dati, setDati] = useState<(DatiCervedCliente & { id: string }) | null>(null);
  useEffect(() => {
    const ricevi = (e: Event) => setDati((e as CustomEvent).detail);
    window.addEventListener("campione-cerved", ricevi);
    return () => window.removeEventListener("campione-cerved", ricevi);
  }, []);
  if (!dati) return <p>Caricamento</p>;
  return <div className="p-3">
    <SezioneCervedCompatta dati={{ lightReport: dati.foto.light_report ?? null, scores: dati.foto.score?.scores ?? null }} fidoAttuale={65500} />
    <VistaCerved dati={dati} clienteId={dati.id} fidoMade={65500} puoAggiornare={false} inCorso={false} onAggiorna={() => {}} />
  </div>;
}