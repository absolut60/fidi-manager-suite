import { createFileRoute } from "@tanstack/react-router";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";

export const Route = createFileRoute("/_app/preventivatore/")({
  head: () => ({ meta: [
    { title: "Preventivi — Sistema MADE" },
    { name: "description", content: "Preventivi Sistema MADE: elenco e creazione con cliente, titolo e condizioni di pagamento Gamma." },
    { property: "og:title", content: "Preventivi — Sistema MADE" },
    { property: "og:description", content: "Elenco e creazione dei preventivi con le condizioni del cliente." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <PreventiviListView tipo="preventivo" />,
});
