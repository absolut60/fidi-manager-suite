import { createFileRoute } from "@tanstack/react-router";
import { CellaUm } from "@/components/preventivatore/RigheTable";

export const Route = createFileRoute("/prova-um")({
  component: ProvaUm,
});

function ProvaUm() {
  return (
    <div className="mx-auto max-w-md p-4">
      <div className="grid w-[140px] grid-cols-[72px_1fr] border border-input text-xs">
        <div className="border-r border-input px-1 py-1">
          <CellaUm idx={0} um1="PZ" um2="PAL" fattore={24} secondaria={false} disabled={false} onChange={() => {}} />
        </div>
        <div className="px-1 py-1">riga 1</div>
        <div className="border-r border-input px-1 py-1">
          <CellaUm idx={1} um1="PZ" um2="PAL" fattore={24} secondaria disabled={false} onChange={() => {}} />
        </div>
        <div className="px-1 py-1">riga 2</div>
        <div className="border-r border-input px-1 py-1">
          <CellaUm idx={2} um1="MQ" um2={null} fattore={null} secondaria={false} disabled={false} onChange={() => {}} />
        </div>
        <div className="px-1 py-1">riga 3</div>
      </div>
    </div>
  );
}
