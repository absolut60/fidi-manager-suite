import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SchedaFornitore } from "@/components/fornitori/SchedaFornitore";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { PaginazioneFornitori } from "@/components/fornitori/controlli-fornitori";
import { dettaglioFornitoreSchema, type FornitoreElenco, type ArticoloFornitore } from "@/lib/fornitori";
import { tabSchedaFornitore } from "@/lib/scheda-fornitore";
import fixture from "./tmp-fornitori-fixture.json";

export const Route = createFileRoute("/verifica-fornitori")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  const [pronto, setPronto] = useState(false);
  const [vista, setVista] = useState("elenco");
  const [indice, setIndice] = useState(0);
  const [tab, setTab] = useState("panoramica");
  const [ricerca, setRicerca] = useState("");
  const [preferenziali, setPreferenziali] = useState(false);
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    const filtri = { fornitoreId: fixture.fornitori[indice].id, testo: ricerca, soloPreferenziali: preferenziali, limite: 50, offset: (pagina - 1) * 50 };
    qc.setQueryData(["fornitore-articoli", filtri], { rows: fixture.articoli.map(a => ({ ...a, costo_ultimo: a.costo_ultimo === null ? null : Number(a.costo_ultimo) })), total: 5419 });
  }, [qc, indice, ricerca, preferenziali, pagina]);
  useEffect(() => {
    qc.setQueryDefaults(["fornitore-articoli"], { staleTime: Infinity, queryFn: async () => ({ rows: fixture.articoli.map(a => ({ ...a, costo_ultimo: Number(a.costo_ultimo) })) satisfies ArticoloFornitore[], total: 5419 }) });
    qc.setQueryDefaults(["catalogo-articolo"], { staleTime: Infinity });
    qc.setQueryData(["catalogo-articolo", "VGUAEA"], fixture.articolo);
    qc.setQueryDefaults(["catalogo-articolo-disponibilita"], { staleTime: Infinity });
    qc.setQueryData(["catalogo-articolo-disponibilita", "VGUAEA"], []);
    setPronto(true);
  }, [qc]);
  if (!pronto) return <p>Caricamento…</p>;
  const fornitori = fixture.fornitori.map(f => dettaglioFornitoreSchema.parse(f));
  const rows = fornitori.map(f => ({ ...f, anche_cliente: true, totale: 2543 })) as FornitoreElenco[];
  return <div className="mx-auto w-full max-w-7xl p-3 lg:p-6"><div className="mb-3 flex gap-2"><Button onClick={() => setVista("elenco")}>Elenco</Button><Button onClick={() => { setIndice(0); setVista("scheda"); setTab("panoramica"); }}>Viglietta</Button><Button onClick={() => { setIndice(1); setVista("scheda"); setTab("clienti"); }}>Dales</Button></div>{vista === "elenco" ? <><h1 className="mb-4 text-2xl font-bold text-navy">Fornitori</h1><ElencoFornitori rows={rows} apri={id => { setIndice(fornitori.findIndex(f => f.id === id)); setVista("scheda"); }} /><PaginazioneFornitori totale={2543} pagina={1} dimensione={100} nome="fornitori" onChange={() => {}} /></> : <SchedaFornitore fornitore={fornitori[indice]} tab={tabSchedaFornitore(tab)} onTabChange={setTab} statoArticoli={{ ricerca, preferenziali, pagina, cambiaRicerca: setRicerca, cambiaPreferenziali: setPreferenziali, cambiaPagina: setPagina }} />}</div>;
}