import { createFileRoute } from "@tanstack/react-router";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { ConvenzioneCard } from "@/components/fornitori/ConvenzioneFornitore";
import { BandierinaConvenzionato } from "@/components/fornitori/BandierinaConvenzionato";
import { BadgeTipoFornitore } from "@/components/fornitori/controlli-fornitori";
export const Route = createFileRoute("/prova-f7")({ component: P });
const r = (i: number, conv: boolean) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, origine: "gamma", codice_gestionale: 1000 + i, ragione_sociale: i === 1 ? "KNAUF ITALIA GESSI E MALTE S.A.S. DI KNAUF" : `FORNITORE PROVA ${i} SRL`, alias: null, partita_iva: "01234567890", codice_fiscale: null, citta: "Milano", provincia: "MI", condizione_pagamento_desc: "RB 60 gg FM", persona_fisica: false, valida: true, n_articoli: 12, n_preferenziale: 3, anche_cliente: i === 2, macrocategoria_cod: null, macrocategoria_desc: null, email: "info@prova.it", tipo_effettivo: conv ? "merci" : "da_classificare", tipo_fonte: conv ? "convenzionato" : "nessuna", stato_convenzione: conv ? "convenzionato" : "non_convenzionato", stato_convenzione_fonte: null, totale: 3 });
const det = (conflitto: boolean, admin: boolean) => ({ id: "x", stato_convenzione: "convenzionato", stato_convenzione_fonte: "app", stato_convenzione_il: "2026-11-12T15:30:00Z", stato_convenzione_da_nome: "Andrea Giani", tipo_conflitto_convenzione: conflitto, puo_cambiare_convenzione: admin }) as never;
function P() {
  return <div className="mx-auto max-w-7xl space-y-4 p-3">
    <div><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">KNAUF ITALIA GESSI E MALTE</h1><div className="mt-2 flex flex-wrap gap-1.5"><span className="inline-flex items-center text-sm font-medium"><BandierinaConvenzionato className="-ml-1" />Convenzionato</span><BadgeTipoFornitore tipo="merci" fonte="convenzionato" /></div></div>
    <ElencoFornitori rows={[r(1, true), r(2, false), r(3, true)] as never} apri={() => {}} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><ConvenzioneCard fornitore={det(false, true)} /><ConvenzioneCard fornitore={det(true, false)} /></div>
  </div>;
}
