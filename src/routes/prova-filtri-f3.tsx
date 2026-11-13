import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FiltriCatalogoArticoli } from "@/components/articoli/FiltriCatalogoArticoli";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import type { ScelteCascata, TernaArticoliFiltri } from "@/lib/filtri-catalogo-articoli";
const T = (cf: string | null, f: string | null, cs: string | null, s: string | null, mc: string | null, m: string | null, n: number): TernaArticoliFiltri => ({ codice_famiglia: cf, famiglia: f, codice_sottofamiglia: cs, sottofamiglia: s, marca_codice: mc, marca: m, conteggio: n });
const terne = [T("FE","FERRAMENTA","AB","ABBIGLIAMENTO","KAP","KAPRIOL",1297),T("FE","FERRAMENTA","AB","ABBIGLIAMENTO","DIA","DIADORA",321),T("SR","SHOWROOM","AB","ARREDO BAGNO","ARB","ARBI",320),T("SR","SHOWROOM","AB","ARREDO BAGNO","POZ","POZZEBON",205),T("SR","SHOWROOM","PA","PAVIMENTI","MAR","MARAZZI",950),T("SR","SHOWROOM",null,null,null,null,840),T(null,null,null,null,null,null,5)];
export const Route = createFileRoute("/prova-filtri-f3")({ component: P });
function P() {
  const qc = useQueryClient();
  useState(() => qc.setQueryData(["terne-articoli-filtri"], terne));
  const [s, setS] = useState<ScelteCascata>({ famiglie: ["SR"], coppie: ["SR|AB"], marche: ["ARB"] });
  return <div className="flex h-full min-h-0 flex-col"><header className="border-b bg-card px-3 py-3 lg:px-6"><h1 className="text-xl font-bold text-navy">Articoli</h1>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <FiltriCatalogoArticoli scelte={s} onChange={setS} />
      <FiltroMultiplo etichetta="Fornitore" testoTutti="Tutti i fornitori" opzioni={[]} selezionati={[]} onChange={() => {}} />
      <FiltroMultiplo etichetta="Stato" testoTutti="Tutti gli stati" opzioni={[]} selezionati={[]} onChange={() => {}} />
      <FiltroMultiplo etichetta="Disponibile in" testoTutti="Ovunque" opzioni={[]} selezionati={[]} onChange={() => {}} />
    </div></header><pre data-testid="s" className="p-3 text-xs">{JSON.stringify(s)}</pre></div>;
}
