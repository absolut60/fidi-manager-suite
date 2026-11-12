import { createFileRoute } from "@tanstack/react-router";
import { SchedaArticoloGamma } from "@/components/articoli/SchedaArticoloGamma";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
// TEMPORANEO: verifica grafica FM63 F6 con dati finti. Da rimuovere.
export const Route = createFileRoute("/prova-fm63-f6")({ component: P });
const base = { attivo: true, stato_gamma: "in_uso", um: "MQ", um2: "NR", fattore_conversione: 3.6, famiglia: "LASTRE", sottofamiglia: "CARTONGESSO STANDARD", costo_ultimo: 3.01, costo_medio: 3.1, costo_fifo: 3.05, listiniVisibili: [], globale: true, storeIdUtente: null, fornitori: [], tecnico: null, utilizzo: null, puoModificareTecnici: false };
const art: any[] = [
  { ...base, codice: "FASL00H003300A0", descrizione: "LASTRA IN CARTONGESSO STANDARD 12,5 MM 1200X3000 BORDO ASSOTTIGLIATO", marca_codice: "FAS", marche: { descrizione: "FASSA BORTOLO" }, fornitore: { id: "x1", ragione_sociale: "FASSA S.R.L. STABILIMENTO DI SPRESIANO E DEPOSITI LOMBARDIA", stato_convenzione: "convenzionato", fornitore_obsoleto: false } },
  { ...base, codice: "LACLSBT40", um2: "NR", fattore_conversione: 1, descrizione: "LANA DI VETRO SBT 40", marca_codice: null, marche: null, fornitore: null },
  { ...base, codice: "ALTRO", descrizione: "ARTICOLO CON FORNITORE OBSOLETO", marca_codice: "MUN", marche: { descrizione: "MUNGO" }, fornitore: { id: "x2", ragione_sociale: "MUNGO SPA **", stato_convenzione: null, fornitore_obsoleto: true } },
];
const f = (i: number, conv: boolean, nome: string): any => ({ id: `f${i}`, codice_gestionale: `F${1000 + i}`, ragione_sociale: nome, citta: "CINISELLO BALSAMO", provincia: "MI", partita_iva: "01234567890", tipo_effettivo: i % 3 ? "merci" : "servizi", tipo_fonte: "gamma", marca_codice: "FAS", marca_descrizione: "FASSA BORTOLO", sottocategoria_descrizione: "TRASPORTI", email: i % 2 ? "a@b.it" : null, stato_convenzione: conv ? "convenzionato" : null, obsoleto: false });
const rows = [f(1, true, "FASSA S.R.L. STABILIMENTO DI SPRESIANO E DEPOSITI"), f(2, false, "MUNGO ITALIA"), f(3, true, "KNAUF"), f(4, true, "SAINT-GOBAIN ITALIA S.P.A. DIVISIONE GYPROC SISTEMI A SECCO"), f(5, false, "ROSSI TRASPORTI SNC")];
function P() {
  return <div className="w-full min-w-0 space-y-10 p-3 lg:p-6">{art.map((a) => <div key={a.codice} id={a.codice}><SchedaArticoloGamma articolo={a} /></div>)}
    <div id="elenco"><ElencoFornitori rows={rows} apri={() => {}} selezione={{ selezionati: new Set(["f3", "f2"]), cambia: () => {}, tutti: { tutti: false, alcuni: true, onChange: () => {} } as any }} ordinamento={{ ordina: "ragione_sociale" as any, direzione: "asc", imposta: () => {} }} /></div></div>;
}
