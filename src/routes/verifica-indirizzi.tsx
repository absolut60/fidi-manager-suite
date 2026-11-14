import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NuovoLeadDialog } from "@/components/lead/nuovo-lead-dialog";
import { StoreDialog } from "@/routes/_app/impostazioni";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BloccoIndirizzo } from "@/components/blocco-indirizzo";
export const Route = createFileRoute("/verifica-indirizzi")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  const [modo, setModo] = useState<"lead" | "sede" | null>(null);
  const [value, setValue] = useState({ indirizzo: "", cap: "", citta: "", provincia: "" });
  const [disabled, setDisabled] = useState(false);
  useState(() => { qc.setQueryData(["chiave-mappe"], "chiave-simulata"); });
  return <main className="p-4 space-y-4">
    <Button onClick={() => setModo("lead")}>Nuovo lead</Button>
    <Button onClick={() => setModo("sede")}>Nuova sede</Button>
    <Dialog open={modo !== null} onOpenChange={(v) => { if (!v) setModo(null); }}>
      {modo === "lead" ? <NuovoLeadDialog onClose={() => setModo(null)}/> : modo === "sede" ? <StoreDialog editing={null} onClose={() => setModo(null)}/> : null}
    </Dialog>
    <Button onClick={() => { qc.setQueryData(["chiave-mappe"], null); }}>Senza chiave</Button>
    <Button onClick={() => setDisabled((v) => !v)}>Disabilita</Button>
    <section aria-label="Prova manuale"><BloccoIndirizzo value={value} onChange={(d) => setValue((v) => ({ ...v, ...d }))} disabled={disabled}/></section>
  </main>;
}