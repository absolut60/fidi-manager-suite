import { createFileRoute } from "@tanstack/react-router";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";

export const Route = createFileRoute("/_app/ordini/")({
  head: () => ({ meta: [{ title: "Ordini — Sistema MADE" }] }),
  component: () => <PreventiviListView tipo="ordine" />,
});
