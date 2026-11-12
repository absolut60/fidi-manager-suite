// Pagina TEMPORANEA di sola verifica (viene rimossa a fine controllo).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SelettoreScadenzeAperte } from "@/components/selettore-scadenze-aperte";

export const Route = createFileRoute("/tmp-selettore")({
  component: Pagina,
});

function Pagina() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <div className="p-4 mx-auto max-w-3xl">
      <SelettoreScadenzeAperte
        clienteId="00000000-0000-0000-0000-000000000000"
        open
        selectedIds={sel}
        onChange={setSel}
      />
    </div>
  );
}
