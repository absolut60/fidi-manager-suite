import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClienteCervedTab } from "@/components/cliente-cerved-tab";
import { GaugeCerved, tintaGaugeCerved } from "@/components/cerved/gauge-cerved";
import { datiCervedCompatto } from "@/lib/cerved-presentazione";
import { useCervedCompattoClienti, type CervedCompattoCliente } from "@/hooks/use-cerved-compatto-clienti";

/** Sezione Cerved compatta: gauge CGS piccolo + fido certificato. Nulla se non ci sono dati. */
/**
 * clienteId abilita "Apri scheda Cerved". anteprima=true (default) apre la scheda Cerved completa (ClienteCervedTab)
 * in una finestra sovrapposta, senza navigare: usato dentro dialog con dati non salvati (nuova richiesta, proposta massiva).
 * anteprima=false naviga nella stessa pagina a /clienti/<id>?tab=cerved (pagina di approvazione).
 */
export function SezioneCervedCompatta({ dati, fidoAttuale, className = "", clienteId, anteprima = true }: {
  dati: CervedCompattoCliente | null | undefined; fidoAttuale: number | null | undefined; className?: string;
  clienteId?: string | null; anteprima?: boolean;
}) {
  const [aperta, setAperta] = useState(false);
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
      {clienteId && (anteprima ? (
        <button type="button" onClick={() => setAperta(true)} className={CLASSE_PULSANTE}
          title="Apri scheda Cerved" aria-label="Apri scheda Cerved">
          <ExternalLink className="size-4" />
        </button>
      ) : (
        <Link to="/clienti/$clienteId" params={{ clienteId }} search={{ tab: "cerved" }} className={CLASSE_PULSANTE}
          title="Apri scheda Cerved" aria-label="Apri scheda Cerved">
          <ExternalLink className="size-4" />
        </Link>
      ))}
      {clienteId && anteprima && aperta && (
        <AnteprimaSchedaCerved clienteId={clienteId} fidoAttuale={fidoAttuale} onClose={() => setAperta(false)} />
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

const CLASSE_PULSANTE = "ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:size-8 sm:order-last";

/** Finestra sovrapposta con la scheda Cerved completa (riuso di ClienteCervedTab), nessun cambio di URL. */
function AnteprimaSchedaCerved({ clienteId, fidoAttuale, onClose }: {
  clienteId: string; fidoAttuale: number | null | undefined; onClose: () => void;
}) {
  const { data: cliente } = useQuery({
    queryKey: ["cerved-anteprima-anagrafica", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clienti").select("ragione_sociale, partita_iva").eq("id", clienteId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 overflow-hidden rounded-none p-4 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg lg:max-w-5xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words line-clamp-2">{cliente?.ragione_sociale ?? "Scheda Cerved"}</DialogTitle>
          <DialogDescription>Scheda Cerved</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {cliente !== undefined && <ClienteCervedTab clienteId={clienteId} partitaIva={cliente?.partita_iva} fidoMade={fidoAttuale} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Variante per un singolo cliente: stessa lettura batch con un solo id. */
export function SezioneCervedCompattaCliente({ clienteId, fidoAttuale, className, anteprima = true }: {
  clienteId: string | null | undefined; fidoAttuale: number | null | undefined; className?: string; anteprima?: boolean;
}) {
  const ids = clienteId ? [clienteId] : [];
  const { data } = useCervedCompattoClienti(ids);
  return <SezioneCervedCompatta dati={clienteId ? data?.[clienteId] : null} fidoAttuale={fidoAttuale} className={className} clienteId={clienteId} anteprima={anteprima} />;
}
