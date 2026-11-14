import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CantierePicker } from "@/components/preventivatore/CantierePicker";
export const Route = createFileRoute("/verifica-picker")({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  useState(() => { qc.setQueryData(["chiave-mappe"], null); qc.setQueryData(["agenti-lookup"], []); });
  return <main className="p-4"><h1>Preventivo simulato</h1><CantierePicker cliente_id="11111111-1111-4111-8111-111111111111" value={value} onChange={setValue}/></main>;
}