import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/preventivatore/")({
  component: PreventivatoreIndexPage,
});

function PreventivatoreIndexPage() {
  return <div className="p-4 text-sm text-muted-foreground">Preventivatore (in costruzione)</div>;
}
