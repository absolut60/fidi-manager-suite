import { createFileRoute } from "@tanstack/react-router";
import { DashboardFidi } from "@/components/dashboard-fidi";

export const Route = createFileRoute("/tmp-dashboard-compatta")({
  head: () => ({ meta: [{ title: "Verifica Dashboard fidi · MADE" }, { name: "description", content: "Verifica temporanea con dati finti" }, { property: "og:title", content: "Verifica Dashboard fidi · MADE" }, { property: "og:description", content: "Verifica temporanea con dati finti" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => {
    context.queryClient.setQueryData(["dashboard-fidi"], {
      fido_concesso_eur: 10498000, fido_concesso_clienti: 2135,
      fido_proposto_eur: 11925000, fido_proposto_clienti: 2300,
      da_verificare_n: 124, insoluti_n: 210, insoluti_eur: 1493250,
      insoluti_non_bloccati_n: 31, scaduto_eur: 3785400,
      scaduto_over60_eur: 1943500, aggiornato_al: "2026-11-05T08:45:00Z",
    });
    const categorie = ["imprese", "privati", "bloccati", "legale", "contanti_pos"];
    const rows = ["concesso", "proposto", "variazione", "oltre"].flatMap((card) => categorie.map((gruppo, i) => ({
      card, gruppo, n_clienti: i === 0 ? 1761 : 84, importo: card === "variazione" ? 1427000 : i === 0 ? 9993500 : 126000,
      n_aumenti: 125, n_riduzioni: 38, n_con_fido: 0,
    })));
    rows.push({ card: "concesso", gruppo: "fermi", n_clienti: 513, importo: 411000, n_aumenti: 0, n_riduzioni: 0, n_con_fido: 513 });
    for (const gruppo of ["imprese", "privati"]) rows.push({ card: "fermi", gruppo, n_clienti: 513, importo: 411000, n_aumenti: 0, n_riduzioni: 0, n_con_fido: 513 });
    for (const gruppo of ["vicini", "piu", "ordini", "totale"]) rows.push({ card: "occhio", gruppo, n_clienti: 1761, importo: 9993500, n_aumenti: 0, n_riduzioni: 0, n_con_fido: 0 });
    context.queryClient.setQueryData(["dashboard-fidi-gruppi"], rows);
  },
  component: () => <main className="p-4 sm:p-6 xl:ml-64"><div className="mx-auto max-w-7xl"><DashboardFidi /></div></main>,
});