import { createFileRoute } from "@tanstack/react-router";
import { ProvaCervedCard } from "@/components/impostazioni/prova-cerved-card";

export const Route = createFileRoute("/tmp-cerved")({
  component: () => (
    <div className="p-4">
      <ProvaCervedCard />
    </div>
  ),
});
