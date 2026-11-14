import { useQuery } from "@tanstack/react-query";
import { SemaforoPallino } from "@/components/semaforo-pallino";
import { fetchIndicatoreClientePreventivo } from "@/lib/preventivi-api";
import { semaforoUI } from "@/lib/semaforo-ui";

/** DTO sintetico dedicato: mai letture della riga cliente o dei dettagli finanziari. */
export function IndicatoreClientePreventivo({ clienteId }: { clienteId?: string | null }) {
  const { data, isError } = useQuery({
    queryKey: ["indicatore-cliente-preventivo", clienteId],
    queryFn: () => clienteId ? fetchIndicatoreClientePreventivo(clienteId) : null,
    enabled: !!clienteId,
    staleTime: 30_000,
  });
  if (!clienteId) return null;
  if (isError) return <span className="text-xs text-muted-foreground" title="Impossibile leggere l’indicatore cliente">Indicatore non disponibile</span>;
  if (!data) return null;
  const title = !data.stadio || data.stadio === "spento" ? "Dati insufficienti" : `Affidabilità MADE: ${data.stadio}`;
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Indicatore cliente MADE">
    <SemaforoPallino cliente={{ fido_teorico_cliente: { semaforo_stadio: data.stadio } }} title={title} />
    {data.bloccato && <span className={semaforoUI("rosso").textClass}>Bloccato</span>}
    {data.in_legale && <span className={semaforoUI("rosso").textClass}>In legale</span>}
    {data.scaduto_presente && <span className={semaforoUI("arancione").textClass}>Scaduto presente</span>}
  </span>;
}