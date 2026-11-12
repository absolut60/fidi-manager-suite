import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SchedaArticoloGamma, type DettaglioGamma } from "@/components/articoli/SchedaArticoloGamma";
export const Route = createFileRoute("/prova-fm63")({ ssr: false, component: P });
const base = { acq_prezzo: 7.95, acq_sc1: 50, acq_sc2: null, acq_sc3: null, acq_trasporto_perc: null, acq_trasporto_euro: null, costo_acquisto: 3.975, prezzo_listino: 5.565, prezzo_deposito: null };
const r = (listino: number, descr: string, store_id: string | null, sede: string | null, dep: string | null, prezzo: number) => ({ ...base, listino, listino_descrizione: descr, store_id, sede_nome: sede, deposito_codice: dep, prezzo, prezzo_deposito: dep ? prezzo : null, fonte: dep ? "deposito" : "listino" });
function P() {
  const sede = new URLSearchParams(location.search).get("sede") === "1";
  const qc = useQueryClient();
  const d = (livello: string, store_id: string | null, nome: string, g: number) => ({ livello, store_id, nome, deposito_codice: livello === "deposito" ? "CA" : null, conta_disponibilita: "si", giacenza: g, impegnato_clienti: 2, ordinato_fornitori: 10, disponibilita: g - 2 + 10 });
  qc.setQueryData(["catalogo-articolo-disponibilita", "ITA1000108"], [d("sede", "s1", "SEDE DI CASOREZZO", 40), d("sede", "s3", "SEDE DI CAMBIAGO", 15), d("sede", "s4", "SEDE DI PIANEZZA", 0), d("logistica_comune", null, "Logistica comune", 15), d("deposito", "s3", "Cambiago", 15)]);
  const listini = sede ? [r(10, "Lombardia", "s3", "SEDE DI CAMBIAGO", "CA", 4.8)] : [r(10, "Lombardia", null, null, null, 5.565), r(10, "Lombardia", "s1", "SEDE DI CASOREZZO", "00", 5.6), r(10, "Lombardia", "s3", "SEDE DI CAMBIAGO", "CA", 4.8), r(20, "Piemonte", null, null, null, 5.565), r(20, "Piemonte", "s4", "SEDE DI PIANEZZA", "DA", 5.2), r(30, "Applicatori", null, null, null, 5.565)];
  const a = { codice: "ITA1000108", descrizione: "LASTRA CARTONGESSO STANDARD 12,5 MM 1200X3000 CON DESCRIZIONE LUNGA", attivo: true, stato_gamma: "in_uso", marche: { descrizione: "KNAUF" }, famiglia: "Cartongesso", sottofamiglia: "Lastre", costo_ultimo: 3.975, costo_medio: 3.9, costo_fifo: 3.95, fornitore: { id: "x", ragione_sociale: "KNAUF ITALIA SAS", fornitore_obsoleto: false }, fornitori: [], tecnico: null, utilizzo: null, puoModificareTecnici: false, listiniVisibili: listini, globale: !sede, storeIdUtente: sede ? "s3" : null } as unknown as DettaglioGamma;
  const tab = (new URLSearchParams(location.search).get("tab") ?? "panoramica") as never;
  return <div className="min-w-0 w-full p-3 lg:p-6"><SchedaArticoloGamma articolo={a} tab={tab} /></div>;
}
