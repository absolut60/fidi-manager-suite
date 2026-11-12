import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import type { OrdinamentoFornitori } from "@/lib/fornitori";
export const Route = createFileRoute("/anteprima-fornitori-tmp")({ component: P });
const r = (i: number, x: any) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, origine: "gamma", codice_gestionale: 100 + i, alias: null, codice_fiscale: null, provincia: "BO", condizione_pagamento_desc: null, persona_fisica: false, valida: true, n_articoli: 0, n_preferenziale: 0, anche_cliente: false, macrocategoria_cod: null, macrocategoria_desc: null, tipo_fonte: "app", stato_convenzione: "non_convenzionato", stato_convenzione_fonte: null, totale: 3, email: null, ...x });
const rows = [r(1, { ragione_sociale: "ZETA EDILIZIA SRL", citta: "ZOLA PREDOSA", partita_iva: "01234567890", tipo_effettivo: "merci", email: "a@b.it", stato_convenzione: "convenzionato" }), r(2, { ragione_sociale: "MARIO ROSSI IMPIANTI ELETTRICI E IDRAULICI SNC", citta: "MODENA", partita_iva: "09876543210", tipo_effettivo: "servizi", tipo_fonte: "gamma" }), r(3, { ragione_sociale: "ALFA LEGNAMI SPA", citta: "BOLOGNA", partita_iva: "11122233344", tipo_effettivo: null })];
function P() { const [o, setO] = useState<{ ordina: OrdinamentoFornitori; direzione: "asc" | "desc" }>({ ordina: "citta", direzione: "desc" });
  const [sel, setSel] = useState(new Set<string>());
  return <div className="mx-auto w-full max-w-7xl p-3 lg:p-6"><ElencoFornitori rows={rows as any} apri={() => {}} ordinamento={{ ...o, imposta: (ordina, direzione) => setO({ ordina, direzione }) }} selezione={{ selezionati: sel, cambia: (id, v) => setSel(p => { const n = new Set(p); v ? n.add(id) : n.delete(id); return n; }), tutti: { tutti: false, alcuni: false, onChange: () => {} } }} /></div>; }
