import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArticoloGammaPicker } from "@/components/preventivatore/ArticoloGammaPicker";
import type { TernaArticoliFiltri } from "@/lib/filtri-catalogo-articoli";
const T = (cf: string | null, f: string | null, cs: string | null, s: string | null, mc: string | null, m: string | null, n: number): TernaArticoliFiltri => ({ codice_famiglia: cf, famiglia: f, codice_sottofamiglia: cs, sottofamiglia: s, marca_codice: mc, marca: m, conteggio: n });
const terne = [T("FE","FERRAMENTA","AB","ABBIGLIAMENTO","KAP","KAPRIOL",1297),T("SR","SHOWROOM","AB","ARREDO BAGNO","ARB","ARBI",320),T("SR","SHOWROOM","AB","ARREDO BAGNO","POZ","POZZEBON",205),T("SR","SHOWROOM","PA","PAVIMENTI","MAR","MARAZZI",1950)];
const items = [1,2,3].map(i => ({ codice: `ARB00${i}`, descrizione: `Mobile bagno sospeso ${60+i*10} cm finitura rovere`, marca: "ARBI", um: "PZ" }));
export const Route = createFileRoute("/prova-picker-f4")({ component: P });
function P() {
  const qc = useQueryClient();
  useState(() => { qc.setQueryData(["terne-articoli-filtri"], terne);
    qc.setQueryData(["articoli-gamma-preventivo", "", { famiglie: ["SR"], coppie: [], marche: [] }], items);
    qc.setQueryData(["articoli-gamma-preventivo", "", { famiglie: ["SR"], coppie: ["SR|AB"], marche: [] }], items); });
  return <div className="p-3"><table className="w-full table-fixed border text-xs"><tbody><tr><td className="w-10 border p-1">1</td><td className="w-32 border p-1">
    <ArticoloGammaPicker soloCodice autoOpen preventivoId="prova" codice={null} descrizione={null} onChange={() => {}} /></td><td className="border p-1">Descrizione</td></tr></tbody></table></div>;
}
