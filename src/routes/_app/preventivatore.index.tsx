import { createFileRoute } from "@tanstack/react-router";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";

export const Route = createFileRoute("/_app/preventivatore/")({
  head: () => ({ meta: [{ title: "Preventivi — Sistema MADE" }] }),
  component: () => <PreventiviListView tipo="preventivo" />,
});
