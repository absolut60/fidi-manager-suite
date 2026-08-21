import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/preventivatore/$id")({
  component: PreventivatoreEditorPage,
});

function PreventivatoreEditorPage() {
  const { id } = Route.useParams();
  return <div className="p-4 text-sm text-muted-foreground">Editor preventivo {id} (in costruzione)</div>;
}
