import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnteprimaPdfDialog } from "@/components/preventivatore/AnteprimaPdfDialog";
import { InviaPreventivoEmailDialog } from "@/components/preventivatore/InviaPreventivoEmailDialog";
export const Route = createFileRoute("/prova-anteprima-temp")({ component: P, ssr: false });
function P() {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mail, setMail] = useState(false);
  useEffect(() => { (async () => { const { jsPDF } = await import("jspdf"); const d = new jsPDF(); d.setFontSize(9); for (let i = 0; i < 60; i++) d.text(`Riga di prova ${i} — PREVENTIVO PRV-167/26 PIPPO SRL testo piccolo nitido`, 14, 14 + i * 4.5); setBlob(d.output("blob")); })(); }, []);
  const prev = { id: "c39a3e7c-dc79-4ca4-b914-b264c8ae3f13", numero: "PRV-167/26", titolo: "Bagno", validita: "2026-12-31", totale: 12200, store_id: null, cliente_id: null, lead_id: "x", cliente: null, lead: { ragione_sociale: "PIPPO SRL", nome: null, cognome: null, email: "pippo@esempio.it" } } as never;
  return <><AnteprimaPdfDialog open={!!blob && !mail} onOpenChange={() => {}} blob={blob} fileName="preventivo_PRV-167_26_PIPPO_SRL.pdf" onInviaEmail={() => setMail(true)} />
  <InviaPreventivoEmailDialog open={mail} onOpenChange={setMail} prev={prev} blob={blob} fileName="preventivo_PRV-167_26_PIPPO_SRL.pdf" /></>;
}
