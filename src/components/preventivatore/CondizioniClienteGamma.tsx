import { useQuery } from "@tanstack/react-query";
import { fetchCondizioniPreventivoCliente } from "@/lib/preventivi-api";
import { cn } from "@/lib/utils";

/** FM65: listino e categoria Gamma del cliente, solo lettura (il prezzo segue il cliente). */
export function CondizioniClienteGamma({ clienteId, className }: { clienteId: string | null; className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["condizioni-preventivo-cliente", clienteId],
    queryFn: () => fetchCondizioniPreventivoCliente(clienteId!),
    enabled: !!clienteId,
    staleTime: 5 * 60_000,
  });
  if (!clienteId) {
    return <div className={cn("text-xs text-muted-foreground", className)}>Scegli il cliente per avere i prezzi</div>;
  }
  const listino = isLoading ? "…" : data?.listino != null ? `${data.listino} – ${data.listino_descrizione ?? "—"}` : "—";
  const categoria = isLoading ? "…" : data?.macrocategoria ? `${data.macrocategoria_label ?? "—"} – ${data.categoria_label ?? "—"}` : "—";
  return (
    <div className={cn("grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2", className)}>
      <div className="min-w-0 leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Listino: </span>
        <span className="break-words font-medium text-foreground">{listino}</span>
      </div>
      <div className="min-w-0 leading-tight">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Categoria: </span>
        <span className="break-words font-medium text-foreground">{categoria}</span>
      </div>
    </div>
  );
}
