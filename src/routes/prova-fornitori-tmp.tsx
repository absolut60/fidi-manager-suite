import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { InviaEmailMultiplaDialog } from "@/components/fornitori/InviaEmailMultiplaDialog";
import { LetteraFornitoreDialog } from "@/components/fornitori/LetteraFornitoreDialog";
import { Button } from "@/components/ui/button";
const nomi = ["KNAUF ITALIA S.A.S. DI KNAUF AMMINISTRAZIONE", "SINIAT SPA", "MAPEI S.P.A.", "FASSA SRL", "SAINT-GOBAIN ITALIA S.P.A.", "ROCKWOOL ITALIA SPA"];
const rows = nomi.map((n, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, origine: "gamma", codice_gestionale: 1200 + i, ragione_sociale: n, alias: i === 0 ? "KNAUF" : null, partita_iva: `0${i}123456789`, codice_fiscale: null, citta: ["Castellina Marittima", "Milano", "Milano", "Spresiano", "Milano", "Milano"][i], provincia: ["PI", "MI", "MI", "TV", "MI", "MI"][i], condizione_pagamento_desc: "Ri.Ba. 60 gg fine mese", persona_fisica: false, valida: true, n_articoli: 1200 - i * 100, n_preferenziale: 300, anche_cliente: i % 2 === 0, macrocategoria_cod: i === 3 ? null : i === 4 ? "03" : "01", macrocategoria_desc: i === 4 ? "Servizi" : "Merci", email: i === 2 ? null : `ordini@${n.split(" ")[0].toLowerCase()}.it`, totale: 6 })) as never[];
export const Route = createFileRoute("/prova-fornitori-tmp")({ component: Prova });
function Prova() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [m, setM] = useState<"" | "email" | "lettera">("");
  const ids = [...sel];
  qc.setQueryData(["fornitori", "anteprima-invio", ids], { destinatari: rows.filter((r: any) => sel.has(r.id) && r.email).map((r: any) => ({ id: r.id, nome: r.ragione_sociale, email: r.email })), saltati: rows.filter((r: any) => sel.has(r.id) && !r.email).map((r: any) => ({ id: r.id, nome: r.ragione_sociale })) });
  return <div className="mx-auto w-full max-w-7xl space-y-4 p-3 pb-28 lg:p-6">
    <h1 className="text-2xl font-bold text-navy">Fornitori</h1>
    <ElencoFornitori rows={rows} apri={() => {}} selezione={{ selezionati: sel, cambia: (id, v) => setSel(p => { const n = new Set(p); if (v) n.add(id); else n.delete(id); return n; }), tutti: { tutti: sel.size === rows.length, alcuni: sel.size > 0, onChange: v => setSel(v ? new Set(rows.map((r: any) => r.id)) : new Set()), etichetta: `Seleziona tutti i filtrati (${rows.length})` } }} />
    {sel.size > 0 && <div className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-lg border bg-background px-3 py-2.5 shadow-lg sm:bottom-4 sm:px-4"><div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm font-medium">{sel.size} selezionati</span><Button className="min-h-10 flex-1 sm:flex-none" onClick={() => setM("email")}>Invia email</Button><Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setM("lettera")}>Scarica lettere</Button><Button variant="ghost" className="min-h-10">Deseleziona</Button></div></div>}
    <InviaEmailMultiplaDialog open={m === "email"} onOpenChange={() => setM("")} fornitoriIds={ids} onAvviato={() => {}} />
    <LetteraFornitoreDialog open={m === "lettera"} onOpenChange={() => setM("")} fornitore={{ id: rows[0] && (rows[0] as any).id, ragione_sociale: "KNAUF ITALIA S.A.S." }} onAllegaEmail={() => {}} />
  </div>;
}
