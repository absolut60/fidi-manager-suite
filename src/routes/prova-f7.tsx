import { createFileRoute } from "@tanstack/react-router";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { ConvenzioneCard } from "@/components/fornitori/ConvenzioneFornitore";
import { FiltroSiNo, BadgeConvenzionato, BadgeTipoFornitore } from "@/components/fornitori/controlli-fornitori";
export const Route = createFileRoute("/prova-f7")({ component: P });
const r = (i: number, conv: boolean) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, origine: "gamma", codice_gestionale: 1000 + i, ragione_sociale: i === 1 ? "KNAUF ITALIA GESSI E MALTE S.A.S. DI KNAUF" : `FORNITORE PROVA ${i} SRL`, alias: null, partita_iva: "01234567890", codice_fiscale: null, citta: "Milano", provincia: "MI", condizione_pagamento_desc: "RB 60 gg FM", persona_fisica: false, valida: true, n_articoli: 12, n_preferenziale: 3, anche_cliente: i === 2, macrocategoria_cod: null, macrocategoria_desc: null, email: "info@prova.it", tipo_effettivo: conv ? "merci" : "da_classificare", tipo_fonte: conv ? "convenzionato" : "nessuna", convenzionato: conv, convenzionato_fonte: conv ? "app" : null, totale: 3 });
const det = (conflitto: boolean, gestisce: boolean) => ({ id: "x", convenzionato: true, convenzionato_fonte: "app", convenzionato_il: "2026-11-12T15:30:00Z", convenzionato_da_nome: "Andrea Giani", tipo_conflitto_convenzione: conflitto, puo_modificare_note: gestisce }) as never;
function P() {
  const sel = new Set(["00000000-0000-4000-8000-000000000001"]);
  return <div className="mx-auto max-w-7xl space-y-4 p-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><FiltroSiNo label="Convenzionato" value="si" onChange={() => {}} /></div>
    <ElencoFornitori rows={[r(1, true), r(2, false), r(3, true)] as never} apri={() => {}} selezione={{ selezionati: sel, cambia: () => {}, tutti: { tutti: false, alcuni: true, onChange: () => {}, etichetta: "Seleziona tutti" } as never }} />
    <div className="flex gap-2"><BadgeConvenzionato /><BadgeTipoFornitore tipo="merci" fonte="convenzionato" /></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><ConvenzioneCard fornitore={det(false, true)} /><ConvenzioneCard fornitore={det(true, false)} /></div>
  </div>;
}
