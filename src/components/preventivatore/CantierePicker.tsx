import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchCantieriByCliente } from "@/lib/preventivi-api";

export function CantierePicker({
  cliente_id,
  value,
  onChange,
}: {
  cliente_id: string | null;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { data: cantieri = [] } = useQuery({
    queryKey: ["cantieri", cliente_id],
    queryFn: () => (cliente_id ? fetchCantieriByCliente(cliente_id) : Promise.resolve([])),
    enabled: !!cliente_id,
  });

  const items = useMemo(() => cantieri, [cantieri]);

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={!cliente_id}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={cliente_id ? "Seleziona cantiere…" : "Prima un cliente"} />
      </SelectTrigger>
      <SelectContent>
        {items.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.nome}{c.provincia ? ` · ${c.provincia}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
