import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kit/")({
  head: () => ({ meta: [{ title: "Kit — Sistema MADE" }] }),
  component: () => <div className="p-6">Kit — in costruzione</div>,
});
