import { createFileRoute } from "@tanstack/react-router";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";

export const Route = createFileRoute("/_app/ordini/")({
  head: () => ({ meta: [
    { title: "Ordini — Sistema MADE" },
    { name: "description", content: "Ordini cliente Sistema MADE: elenco con cliente, cantiere, stato ed evasione." },
    { property: "og:title", content: "Ordini — Sistema MADE" },
    { property: "og:description", content: "Elenco degli ordini cliente con stato ed evasione." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <PreventiviListView tipo="ordine" />,
});
