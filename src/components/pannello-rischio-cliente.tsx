/**
 * Pannello rischio cliente — usato sia nel dialog di creazione richiesta fido
 * che nel dettaglio richiesta. UNICA fonte di verita' per i campi mostrati:
 * - Fido gestionale (da clienti.fido_gestionale via getFidoAttuale)
 * - Fido residuo, Totale rischio, Scaduto, A scadere, Insoluti
 * - Condizioni pagamento, Dilazione concordata/effettiva
 * - Semaforo, Stato (Bloccato/Attivo/Legale), Ultima fatt., Ultima sincronizz.
 * - Fatturato anno corrente + precedente (RPC get_fatturato_clienti_scadenziario)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { formatEuro, formatDate } from "@/lib/fidi";

function semaforoCliente(c: any): { tone: string; label: string } {
  if (!c) return { tone: "bg-muted text-muted-foreground", label: "—" };
  if (c.bloccato || c.in_gestione_legale) return { tone: "bg-destructive/15 text-destructive", label: "Rosso" };
  if (Number(c.scaduto ?? 0) > 0) return { tone: "bg-warning/15 text-warning", label: "Giallo" };
  return { tone: "bg-success/15 text-success", label: "Verde" };
}

interface Props {
  cliente: any;
  /** Importo dell'ultimo fido approvato in app (per verifica allineamento col gestionale). */
  ultimoApprovatoImp?: number | null;
  /** Mostra il fatturato anno corrente / precedente (default: true). */
  showFatturato?: boolean;
}

export function PannelloRischioCliente({ cliente, ultimoApprovatoImp = null, showFatturato = true }: Props) {
  const annoCorrente = new Date().getFullYear();
  const annoPrec = annoCorrente - 1;

  const { data: fatt } = useQuery({
    queryKey: ["fatturato-cliente", cliente?.id, annoCorrente, annoPrec],
    enabled: !!cliente?.id && showFatturato,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_fatturato_clienti_scadenziario", {
        _anno_corrente: annoCorrente,
        _anno_prec: annoPrec,
      });
      if (error) throw error;
      const row = (data ?? []).find((r: any) => r.cliente_id === cliente.id);
      return {
        cur: Number(row?.fatturato_anno_corrente ?? 0),
        prev: Number(row?.fatturato_anno_prec ?? 0),
      };
    },
  });

  if (!cliente) return null;
  const sem = semaforoCliente(cliente);
  const fidoAttuale = getFidoAttuale(cliente);
  const disallineato = ultimoApprovatoImp != null && Math.abs(ultimoApprovatoImp - fidoAttuale) > 0.01;

  return (
    <div className="rounded-md border p-3 text-xs space-y-1.5 bg-muted/30">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex justify-between col-span-2 items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Fido gestionale</span>
          <span className="flex items-center gap-2 flex-wrap justify-end">
            <span className="tabular-nums font-medium">{formatEuro(fidoAttuale)}</span>
            {ultimoApprovatoImp != null && (
              <>
                <span className="text-muted-foreground">· Ultimo approvato in app:</span>
                <span className="tabular-nums font-medium">{formatEuro(ultimoApprovatoImp)}</span>
                {disallineato && (
                  <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-warning/15 text-warning border border-warning/30">
                    Da allineare
                  </span>
                )}
              </>
            )}
          </span>
        </div>
        <div className="flex justify-between"><span className="text-muted-foreground">Totale rischio</span><span className="tabular-nums">{formatEuro(Number(cliente.totale_rischio ?? 0))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fido residuo</span><span className={`tabular-nums ${Number(cliente.fido_residuo ?? 0) < 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(Number(cliente.fido_residuo ?? 0))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Scaduto</span><span className={`tabular-nums ${Number(cliente.scaduto ?? 0) > 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(Number(cliente.scaduto ?? 0))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">A scadere</span><span className="tabular-nums">{formatEuro(Number(cliente.a_scadere ?? 0))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Insoluti</span><span className="tabular-nums">{Number(cliente.num_insoluti ?? 0)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Cond. pagamento</span><span className="truncate ml-2">{cliente.condizione_pagamento_desc ?? cliente.condizioni_pagamento ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Dilaz. concordata</span><span className="tabular-nums">{cliente.dilazione_concordata ?? "—"}{cliente.dilazione_concordata != null ? " gg" : ""}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Dilaz. effettiva</span><span className="tabular-nums">{cliente.dilazione_effettiva ?? "—"}{cliente.dilazione_effettiva != null ? " gg" : ""}</span></div>
        {showFatturato && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Fatt. {annoCorrente}</span><span className="tabular-nums">{fatt ? formatEuro(fatt.cur) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fatt. {annoPrec}</span><span className="tabular-nums">{fatt ? formatEuro(fatt.prev) : "—"}</span></div>
          </>
        )}
        <div className="flex justify-between items-center col-span-2"><span className="text-muted-foreground">Semaforo rischio</span>
          <span className={`inline-flex rounded-md px-2 py-0.5 font-medium ${sem.tone}`}>{sem.label}</span>
        </div>
      </div>
      <div className="border-t pt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Stato:</span>
        {cliente.bloccato ? (
          <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-destructive/15 text-destructive">Bloccato{cliente.motivo_blocco ? ` — ${cliente.motivo_blocco}` : ""}</span>
        ) : (
          <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-success/15 text-success">Non bloccato</span>
        )}
        {cliente.in_gestione_legale && (
          <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-warning/15 text-warning">In legale</span>
        )}
        <span className={`inline-flex rounded-md px-2 py-0.5 font-medium ${cliente.cliente_attivo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          {cliente.cliente_attivo ? "Attivo" : "Non attivo"}
        </span>
        {cliente.ultima_data_fatturazione && (
          <span className="text-muted-foreground">· Ultima fatt. {formatDate(cliente.ultima_data_fatturazione)}</span>
        )}
      </div>
      <div className="border-t pt-1.5 text-muted-foreground">
        Ultima sincronizzazione: {cliente.ultima_sincronizzazione
          ? new Date(cliente.ultima_sincronizzazione).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "—"}
      </div>
    </div>
  );
}
