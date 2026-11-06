import { GaugeCerved, tintaGaugeCerved } from "@/components/cerved/gauge-cerved";
import { datiCervedCompatto } from "@/lib/cerved-presentazione";
import { useCervedCompattoClienti, type CervedCompattoCliente } from "@/hooks/use-cerved-compatto-clienti";

/** Sezione Cerved compatta: gauge CGS piccolo + fido certificato. Nulla se non ci sono dati. */
export function SezioneCervedCompatta({ dati, fidoAttuale, className = "" }: {
  dati: CervedCompattoCliente | null | undefined; fidoAttuale: number | null | undefined; className?: string;
}) {
  const v = datiCervedCompatto(dati?.lightReport, dati?.scores, fidoAttuale);
  if (!v) return null;
  const tinta = tintaGaugeCerved(v.valore);
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2 py-1 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cerved</span>
      {v.valore != null && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="relative w-14 shrink-0">
            <GaugeCerved valore={v.valore} className="w-14" />
            <span className="absolute inset-x-0 top-[30%] text-center text-sm font-bold tabular-nums" style={{ color: tinta }}>{v.valore}</span>
          </span>
          {v.fascia && <span className="min-w-0 break-words text-xs font-semibold" style={{ color: tinta }}>{v.fascia}</span>}
        </span>
      )}
      {v.fido && (
        <span className="min-w-0 text-xs">
          <span className="text-muted-foreground">{v.fidoLabel} </span>
          <strong className="tabular-nums">{v.fido}</strong>
          {v.confronto && <span className="block text-[11px] text-muted-foreground">{v.confronto}</span>}
        </span>
      )}
    </div>
  );
}

/** Variante per un singolo cliente: stessa lettura batch con un solo id. */
export function SezioneCervedCompattaCliente({ clienteId, fidoAttuale, className }: {
  clienteId: string | null | undefined; fidoAttuale: number | null | undefined; className?: string;
}) {
  const ids = clienteId ? [clienteId] : [];
  const { data } = useCervedCompattoClienti(ids);
  return <SezioneCervedCompatta dati={clienteId ? data?.[clienteId] : null} fidoAttuale={fidoAttuale} className={className} />;
}
