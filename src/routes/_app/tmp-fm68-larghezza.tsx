import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/tmp-fm68-larghezza")({
  component: Tmp,
});

// PROVA FM68 (da eliminare): riproduce il contenitore del preventivo
// con un finto riquadro di blocco, per misurare lo spazio dal bordo schermo.
function Tmp() {
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4 min-w-0 pv-orizzontale:px-0 pv-orizzontale:py-1">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-card p-3">
        <h1 className="text-xl font-semibold">PROVA FM68</h1>
      </div>
      <div>
        <div className="rounded-xl border bg-card shadow">
          <div className="rounded-t-lg border-b-2 border-pv-blu bg-pv-azzurro p-3">Blocco 1</div>
          <div className="p-3 text-xs">riga finta</div>
        </div>
      </div>
    </div>
  );
}
