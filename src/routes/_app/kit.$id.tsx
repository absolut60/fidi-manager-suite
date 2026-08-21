import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kit/$id")({
  head: () => ({ meta: [{ title: "Dettaglio kit — Sistema MADE" }] }),
  component: () => <div className="p-6">Dettaglio kit — in costruzione</div>,
});
