// FM65 F3: filtri a cascata Famiglia → Sottofamiglia → Marca, condivisi da catalogo articoli e ricerca del preventivo.
// Nessuna logica di filtro qui: opzioni e pulizia vengono solo da filtri-catalogo-articoli.ts.
import { useMemo } from "react";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { opzioniCascata, puliziaScelte, type OpzioneCascata, type ScelteCascata } from "@/lib/filtri-catalogo-articoli";
import { useTerneArticoliFiltri } from "@/lib/use-terne-articoli-filtri";

const voci = (o: OpzioneCascata[]) => o.map(x => ({ valore: x.valore, label: `${x.etichetta} (${x.conteggio.toLocaleString("it-IT")})` }));

export function FiltriCatalogoArticoli({ scelte, onChange }: { scelte: ScelteCascata; onChange: (s: ScelteCascata) => void }) {
  const { data: terne, isLoading, error } = useTerneArticoliFiltri();
  const opzioni = useMemo(() => opzioniCascata(terne ?? [], scelte), [terne, scelte]);
  const cambia = (patch: Partial<ScelteCascata>) => onChange(puliziaScelte(terne ?? [], { ...scelte, ...patch }));
  const attesa = isLoading ? "Caricamento…" : undefined;
  return <div className="contents">
    <FiltroMultiplo etichetta="Famiglia" testoTutti={attesa ?? "Tutte le famiglie"} cercabile selezionaTutte opzioni={voci(opzioni.famiglie)} selezionati={scelte.famiglie} onChange={famiglie => cambia({ famiglie })} />
    <FiltroMultiplo etichetta="Sottofamiglia" testoTutti={attesa ?? "Tutte le sottofamiglie"} cercabile selezionaTutte opzioni={voci(opzioni.sottofamiglie)} selezionati={scelte.coppie} onChange={coppie => cambia({ coppie })} />
    <FiltroMultiplo etichetta="Marca" testoTutti={attesa ?? "Tutte le marche"} cercabile selezionaTutte opzioni={voci(opzioni.marche)} selezionati={scelte.marche} onChange={marche => cambia({ marche })} />
    {error && <p role="alert" className="text-xs text-destructive">Filtri famiglia e marca non disponibili</p>}
  </div>;
}
