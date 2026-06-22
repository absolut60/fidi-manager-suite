/**
 * Pannello rischio cliente — usato sia nel dialog di creazione richiesta fido
 * che nel dettaglio richiesta. UNICA fonte di verita' per i campi mostrati:
 * - Fido gestionale (da clienti.fido_gestionale via getFidoAttuale)
 * - Fido residuo, Totale rischio, Scaduto, A scadere, Insoluti
 * - Condizioni pagamento, Dilazione concordata/effettiva
 * - Semaforo, Stato (Bloccato/Attivo/Legale), Ultima fatt., Ultima sincronizz.
 * - Fatturato anno corrente + precedente (RPC get_fatturato_clienti_scadenziario)
 *
 * Due varianti di presentazione (stessa logica/dati):
 *  - "compact"   (default) — pannello fitto usato nei dialog di creazione
 *  - "extended"  — versione "Quadro cliente" del dettaglio richiesta: 4 metric
 *                  card in evidenza (Totale rischio / Scaduto / Fatt anno corrente
 *                  / Fatt anno precedente) + dettaglio raggruppato sotto.
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
  /** Presentazione: compatta (dialog creazione) o estesa (dettaglio richiesta). */
  variant?: "compact" | "extended";
}

export function PannelloRischioCliente({
  cliente,
  ultimoApprovatoImp = null,
  showFatturato = true,
  variant = "compact",
}: Props) {
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

  const { data: esp } = useQuery({
    queryKey: ["esperienza-pagamento", cliente?.id],
    enabled: !!cliente?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_esperienza_pagamento_cliente", {
        _cliente_id: cliente.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        nPagate: Number(row.n_pagate ?? 0),
        nInRitardo: Number(row.n_in_ritardo ?? 0),
        pctInRitardo: row.pct_in_ritardo != null ? Number(row.pct_in_ritardo) : null,
        ritardoMedio: row.ritardo_medio != null ? Number(row.ritardo_medio) : null,
        maxRitardo: row.max_ritardo != null ? Number(row.max_ritardo) : null,
      };
    },
  });

  if (!cliente) return null;
  const sem = semaforoCliente(cliente);
  const fidoAttuale = getFidoAttuale(cliente);
  const disallineato = ultimoApprovatoImp != null && Math.abs(ultimoApprovatoImp - fidoAttuale) > 0.01;
  const scaduto = Number(cliente.scaduto ?? 0);
  const totRischio = Number(cliente.totale_rischio ?? 0);
  const fidoResiduo = Number(cliente.fido_residuo ?? 0);
  const ultimaSync = cliente.ultima_sincronizzazione
    ? new Date(cliente.ultima_sincronizzazione).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  if (variant === "extended") {
    return (
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Quadro cliente</h2>
          <span className="text-xs text-muted-foreground">
            Ultima sincronizzazione: {ultimaSync}
          </span>
        </div>

        {/* 4 metric card in evidenza */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Totale rischio" value={formatEuro(totRischio)} />
          <MetricCard
            label="Scaduto"
            value={formatEuro(scaduto)}
            tone={scaduto > 0 ? "destructive" : "success"}
            subtext={scaduto === 0 ? "nessuno scaduto" : undefined}
          />
          <MetricCard
            label={`Fatturato ${annoCorrente}`}
            value={fatt ? formatEuro(fatt.cur) : "—"}
          />
          <MetricCard
            label={`Fatturato ${annoPrec}`}
            value={fatt ? formatEuro(fatt.prev) : "—"}
          />
        </div>

        {/* Dettaglio raggruppato in 2 colonne */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0 text-sm">
          <DetailRow label="Fido gestionale">
            <span className="tabular-nums font-medium">{formatEuro(fidoAttuale)}</span>
            {ultimoApprovatoImp != null && (
              <span className="ml-2 text-xs text-muted-foreground">
                · ultimo in app: <span className="tabular-nums">{formatEuro(ultimoApprovatoImp)}</span>
                {disallineato && (
                  <span className="ml-1 inline-flex rounded-md px-1.5 py-0.5 font-medium bg-warning/15 text-warning border border-warning/30">
                    Da allineare
                  </span>
                )}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Fido residuo">
            <span className={`tabular-nums ${fidoResiduo < 0 ? "text-destructive font-medium" : ""}`}>
              {formatEuro(fidoResiduo)}
            </span>
          </DetailRow>
          <DetailRow label="A scadere">
            <span className="tabular-nums">{formatEuro(Number(cliente.a_scadere ?? 0))}</span>
          </DetailRow>
          <DetailRow label="Insoluti">
            <span className="tabular-nums">{Number(cliente.num_insoluti ?? 0)}</span>
          </DetailRow>
          <DetailRow label="Cond. pagamento">
            <span className="truncate text-right">
              {cliente.condizione_pagamento_desc ?? cliente.condizioni_pagamento ?? "—"}
            </span>
          </DetailRow>
          <DetailRow label="Dilaz. concordata">
            <span className="tabular-nums">
              {cliente.dilazione_concordata ?? "—"}
              {cliente.dilazione_concordata != null ? " gg" : ""}
            </span>
          </DetailRow>
          <DetailRow label="Dilaz. effettiva">
            <span className="tabular-nums">
              {cliente.dilazione_effettiva ?? "—"}
              {cliente.dilazione_effettiva != null ? " gg" : ""}
            </span>
          </DetailRow>
          <DetailRow label="Semaforo">
            <span className={`inline-flex rounded-md px-2 py-0.5 font-medium text-xs ${sem.tone}`}>
              {sem.label}
            </span>
          </DetailRow>
        </div>

        <EsperienzaPagamentoBlock esp={esp} variant="extended" />
        <ValutazioneEsternaBlock cliente={cliente} variant="extended" />


        <div className="border-t pt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Stato:</span>
          {cliente.bloccato ? (
            <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-destructive/15 text-destructive">
              Bloccato{cliente.motivo_blocco ? ` — ${cliente.motivo_blocco}` : ""}
            </span>
          ) : (
            <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-success/15 text-success">
              Non bloccato
            </span>
          )}
          {cliente.in_gestione_legale && (
            <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-warning/15 text-warning">
              In legale
            </span>
          )}
          <span className={`inline-flex rounded-md px-2 py-0.5 font-medium ${
            cliente.cliente_attivo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}>
            {cliente.cliente_attivo ? "Attivo" : "Non attivo"}
          </span>
          {cliente.ultima_data_fatturazione && (
            <span className="text-muted-foreground">
              · Ultima fatt. {formatDate(cliente.ultima_data_fatturazione)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // variant === "compact" (default, immutato)
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
        <div className="flex justify-between"><span className="text-muted-foreground">Totale rischio</span><span className="tabular-nums">{formatEuro(totRischio)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fido residuo</span><span className={`tabular-nums ${fidoResiduo < 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(fidoResiduo)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Scaduto</span><span className={`tabular-nums ${scaduto > 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(scaduto)}</span></div>
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
      <EsperienzaPagamentoBlock esp={esp} variant="compact" />
      <ValutazioneEsternaBlock cliente={cliente} variant="compact" />
      <div className="border-t pt-1.5 text-muted-foreground">
        Ultima sincronizzazione: {ultimaSync}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
  subtext,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "destructive" | "info" | "success";
  subtext?: string;
}) {
  const valueTone =
    tone === "destructive" ? "text-destructive" :
    tone === "info" ? "text-info" :
    tone === "success" ? "text-success" : "";
  return (
    <div className="rounded-md bg-secondary px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-base sm:text-lg font-semibold tabular-nums ${valueTone}`}>{value}</p>
      {subtext && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
      )}
	</div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0 border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-foreground font-medium">{children}</span>
    </div>
  );
}
