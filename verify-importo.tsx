import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApprovaDoppiaForm } from "./verify-importo-route";

const richiesta = {
  id: "r-1",
  stato: "in_approvazione",
  tipo: "aumento",
  importo_richiesto: 50000,
  importo_approvato: null,
  livello_richiesto: 2,
  livello_corrente: 1,
  created_at: "2026-10-01T09:00:00Z",
  data_invio: "2026-10-01T09:00:00Z",
  data_chiusura: null,
  motivazione: "Serve fido più ampio per la commessa di novembre",
  richiedente: { nome: "Mario", cognome: "Verdi" },
  approvatore: null,
  condizione_pagamento_cod: "30DF",
  condizione_pagamento_precedente_cod: "60DF",
  esito_fido: null,
  esito_condizione_pagamento: null,
  clienti: {
    id: "c-1",
    ragione_sociale: "Edil Rossi S.r.l.",
    fido_gestionale: 20000,
    totale_rischio: 18000,
    scaduto: 0,
    condizione_pagamento_cod: "60DF",
    condizione_pagamento_desc: "60 giorni fine mese DF",
    stores: { nome: "MADE Bergamo" },
    fido_teorico_cliente: { semaforo_stadio: "verde", semaforo_motivo: null },
  },
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <ApprovaDoppiaForm richiesta={richiesta} />
  </QueryClientProvider>,
);
