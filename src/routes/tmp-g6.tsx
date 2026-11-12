// TEMPORANEO: anteprima con dati finti per screenshot (da rimuovere).
import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SchedaFornitore } from "@/components/fornitori/SchedaFornitore";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { daControllareInProposta } from "@/lib/scheda-fornitore";
import type { DettaglioFornitore, FornitoreElenco } from "@/lib/fornitori.functions";

export const Route = createFileRoute("/tmp-g6")({ component: Pagina });
const ID = "00000000-0000-4000-8000-0000000000f1";
const f: DettaglioFornitore = { id: ID, origine: "gamma", codice_gestionale: 1273, codice_anagrafica_generale: 55, codice_cliente_gamma: null, ragione_sociale: "EDILFORNITURE ESEMPIO SRL", alias: null, partita_iva: "01234567890", codice_fiscale: null, indirizzo: "Via Roma 1", cap: "20100", citta: "Milano", provincia: "MI", stato: "IT", telefono: "02 1234567", telefono_2: null, cellulare: null, fax: null, email: "ordini@esempio.invalid", sito: null, pec: null, persona_fisica: false, valida: true, condizione_pagamento_cod: "B60", condizione_pagamento_desc: "Bonifico 60 gg", attivo: true, note: null, macrocategoria_cod: null, macrocategoria_desc: null, tipo_effettivo: "da_classificare", tipo_fonte: "nessuna", tipo_app_il: null, ultima_modifica_gamma: null, ultima_sincronizzazione: null, clienti: [], n_articoli: 12, n_preferenziale: 3, puo_modificare_note: true, puo_vedere_articoli: true };
const persona = (id: string, nome: string, cognome: string, ruolo: string, extra: object = {}) => ({ id, nome, cognome, ruolo, email: `${nome.toLowerCase()}.${cognome.toLowerCase()}@esempio.invalid`, telefono: null, cellulare: "333 1234567", principale: false, cliente_id: null, lead_id: null, fornitore_id: ID, privacy_firmata: false, data_firma: null, luogo_nascita: null, data_nascita: null, codice_fiscale: null, residenza: null, consenso_profilazione: null, consenso_marketing_media: null, consenso_marketing_diretto: null, ...extra });
const riga = (i: number, tipo: string, fonte: string, art: number): FornitoreElenco => ({ id: `00000000-0000-4000-8000-00000000000${i}`, origine: "gamma", codice_gestionale: 1000 + i, ragione_sociale: ["ALFA LATERIZI SPA", "SERVIZI PULIZIE ROSSI SRL", "BETA TRASPORTI SNC", "GAMMA CEMENTI SRL"][i], alias: null, partita_iva: "0123456789" + i, codice_fiscale: null, citta: "Milano", provincia: "MI", condizione_pagamento_desc: "Bonifico 60 gg", persona_fisica: false, valida: true, n_articoli: art, n_preferenziale: 0, anche_cliente: i === 0, macrocategoria_cod: fonte === "gamma" ? "01" : null, macrocategoria_desc: null, email: i % 2 ? null : "info@esempio.invalid", tipo_effettivo: tipo, tipo_fonte: fonte, totale: 4 });
function Pagina() {
  const [qc] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    q.setQueryData(["contatti-fornitore", ID], [persona("c1", "Mario", "Bianchi", "Commerciale", { principale: true, privacy_firmata: true }), persona("c2", "Lucia", "Verdi", "Amministrazione", { cliente_id: "x" }), persona("c3", "Paolo", "Neri", "Magazzino")]);
    q.setQueryData(["contatti-collegabili", ID, ""], [{ id: "k1", nome: "Giulia", cognome: "Ferri", ruolo: "Titolare", email: "giulia@cliente.invalid", telefono: null, cellulare: "347 000111", azienda: "EDILFORNITURE ESEMPIO SRL (cliente)", del_cliente_collegato: true }, { id: "k2", nome: "Marco", cognome: "Gallo", ruolo: "Tecnico", email: null, telefono: "02 999", cellulare: null, azienda: "STUDIO GALLO", del_cliente_collegato: false }]);
    return q;
  });
  const sp = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const [tab, setTab] = useState<any>(sp.get("tab") ?? "riepilogo");
  const sel = new Set(["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000002"]);
  return <QueryClientProvider client={qc}><div className="mx-auto max-w-7xl p-3 lg:p-6">
    {sp.get("vista") === "elenco"
      ? <ElencoFornitori rows={[riga(0, "da_classificare", "nessuna", 40), riga(1, "da_classificare", "nessuna", 0), riga(2, "da_classificare", "nessuna", 5), riga(3, "merci", "gamma", 9)]} apri={() => {}} evidenzia={daControllareInProposta}
          selezione={{ selezionati: sel, cambia: () => {}, tutti: { tutti: false, alcuni: true, onChange: () => {}, etichetta: "Seleziona tutti i filtrati (4)" } }} />
      : <SchedaFornitore fornitore={f} tab={tab} onTabChange={setTab} statoArticoli={{ ricerca: "", preferenziali: false, pagina: 1, cambiaRicerca: () => {}, cambiaPreferenziali: () => {}, cambiaPagina: () => {} }} />}
  </div></QueryClientProvider>;
}
