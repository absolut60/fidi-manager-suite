import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { DashboardFidi } from "@/components/dashboard-fidi";

// TEMPORANEO: anteprima con dati finti per gli screenshot. Da rimuovere.
export const Route = createFileRoute("/tmp-dash-anteprima")({ component: Pagina });

const g = (card: string, gruppo: string, n: number, importo: number, a = 0, r = 0) =>
  ({ card, gruppo, n_clienti: n, importo, n_aumenti: a, n_riduzioni: r, n_con_fido: 0 });

function Pagina() {
  const [qc] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, enabled: false } } });
    q.setQueryData(["dashboard-fidi"], {
      fido_concesso_eur: 10498000, fido_concesso_clienti: 1969, fido_proposto_eur: 11200000, fido_proposto_clienti: 1958,
      da_verificare_n: 214, insoluti_n: 31, insoluti_eur: 412000, insoluti_non_bloccati_n: 9, scaduto_eur: 1820000,
      scaduto_over60_eur: 640000, aggiornato_al: "2026-11-05T07:12:00Z",
    });
    q.setQueryData(["dashboard-fidi-gruppi"], [
      g("concesso","imprese",1761,9800000), g("concesso","privati",197,520000), g("concesso","bloccati",11,178000),
      g("concesso","legale",0,0), g("concesso","contanti_pos",0,0), g("concesso","fermi",633,1450000),
      g("proposto","imprese",1757,10600000), g("proposto","privati",201,600000), g("proposto","bloccati",0,0), g("proposto","legale",0,0), g("proposto","contanti_pos",0,0),
      g("variazione","imprese",1766,800000,412,388), g("variazione","privati",201,80000,40,21), g("variazione","bloccati",11,-178000,0,11), g("variazione","legale",0,0), g("variazione","contanti_pos",0,0),
      g("oltre","imprese",36,210000), g("oltre","privati",13,18000), g("oltre","bloccati",73,640000), g("oltre","legale",56,980000), g("oltre","contanti_pos",52,120000),
      g("fermi","imprese",513,1200000), g("fermi","privati",122,250000),
      g("occhio","vicini",26,640000), g("occhio","piu",12,380000), g("occhio","ordini",34,910000), g("occhio","totale",57,1500000),
    ]);
    return q;
  });
  return (
    <QueryClientProvider client={qc}>
      <div className="mx-auto max-w-7xl p-3 sm:p-6"><DashboardFidi /></div>
    </QueryClientProvider>
  );
}
