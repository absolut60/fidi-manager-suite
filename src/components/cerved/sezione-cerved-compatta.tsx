import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { GaugeCerved, tintaGaugeCerved } from "@/components/cerved/gauge-cerved";
import { datiCervedCompatto } from "@/lib/cerved-presentazione";
import { useCervedCompattoClienti, type CervedCompattoCliente } from "@/hooks/use-cerved-compatto-clienti";

/** Sezione Cerved compatta: gauge CGS piccolo + fido certificato. Nulla se non ci sono dati. */
/**
 * clienteId abilita "Apri scheda Cerved" (?tab=cerved). nuovaScheda=true apre in una nuova scheda del browser:
 * usato dentro dialog con dati non salvati (nuova richiesta, proposta massiva) per non perdere il lavoro.
 */
export function SezioneCervedCompatta({ dati, fidoAttuale, className = "", clienteId, nuovaScheda = true }: {
  dati: CervedCompattoCliente | null | undefined; fidoAttuale: number | null | undefined; className?: string;
  clienteId?: string | null; nuovaScheda?: boolean;
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
      {clienteId && (
        <Link to="/clienti/$clienteId" params={{ clienteId }} search={{ tab: "cerved" }}
          {...(nuovaScheda ? { target: "_blank", rel: "noopener" } : {})}
          className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:size-8 sm:order-last"
          title="Apri scheda Cerved" aria-label="Apri scheda Cerved">
          <ExternalLink className="size-4" />
        </Link>
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
export function SezioneCervedCompattaCliente({ clienteId, fidoAttuale, className, nuovaScheda = true }: {
  clienteId: string | null | undefined; fidoAttuale: number | null | undefined; className?: string; nuovaScheda?: boolean;
}) {
  const ids = clienteId ? [clienteId] : [];
  const { data } = useCervedCompattoClienti(ids);
  return <SezioneCervedCompatta dati={clienteId ? data?.[clienteId] : null} fidoAttuale={fidoAttuale} className={className} clienteId={clienteId} nuovaScheda={nuovaScheda} />;
}
