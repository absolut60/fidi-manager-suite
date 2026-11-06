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
import { useEsperienzaPagamentoCliente, testiEsperienzaPagamento } from "@/hooks/use-esperienza-pagamento";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { formatEuro, formatDate } from "@/lib/fidi";
import { semaforoUI, LEGENDA_STADIO, testoNumeroSemaforo } from "@/lib/semaforo-ui";
import { useSemaforoAffidabilitaCliente, type SemaforoAffidabilitaDati } from "@/hooks/use-semaforo-affidabilita";
import type { EsperienzaPagamento } from "@/hooks/use-esperienza-pagamento";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CondizionePagamentoTesto } from "@/components/condizione-pagamento-richiesta-select";
import { useLightReportCliente } from "@/hooks/use-light-report-cliente";
import { testiLightReportRischio } from "@/lib/cerved-presentazione";

export function SemaforoAffidabilita({ sem }: { sem: SemaforoAffidabilitaDati }) {
  if (!sem) return <span className="text-muted-foreground">—</span>;
  const ui = semaforoUI(sem.stadio, sem.motivo);
  const legenda = sem.stadio ? LEGENDA_STADIO[sem.stadio] : null;
  const numero = testoNumeroSemaforo(sem.numero, sem.numeroUnita);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-2 cursor-help">
            <span className={`h-2.5 w-2.5 rounded-full ${ui.dotClass}`} aria-hidden />
            <span className={`font-medium ${ui.textClass}`}>{ui.label}</span>
            {numero && <span className="text-muted-foreground tabular-nums">· {numero}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]">
          <p className="font-medium">{sem.motivo}</p>
          {legenda && <p className="text-xs opacity-80 mt-0.5">{legenda}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Badge autonomo: carica da solo il semaforo affidabilita' del cliente
 * (fonte unica: useSemaforoAffidabilitaCliente) e lo mostra.
 */
export function SemaforoAffidabilitaBadge({ clienteId }: { clienteId?: string | null }) {
  const { data: sem, isLoading } = useSemaforoAffidabilitaCliente(clienteId);

  if (isLoading || !sem) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden />
        <span className="text-muted-foreground">—</span>
      </span>
    );
  }
  return <SemaforoAffidabilita sem={sem} />;
}

interface Props {
  cliente: any;
  /** Importo dell'ultimo fido approvato in app (per verifica allineamento col gestionale). */
  ultimoApprovatoImp?: number | null;
  /** Mostra il fatturato anno corrente / precedente (default: true). */
  showFatturato?: boolean;
  /** Presentazione: compatta (dialog creazione) o estesa (dettaglio richiesta). */
  variant?: "compact" | "extended";
  /** Collegamento opzionale nell'intestazione della sola variante estesa. */
  linkScadenze?: React.ReactNode;
}

export function PannelloRischioCliente({
  cliente,
  ultimoApprovatoImp = null,
  showFatturato = true,
  variant = "compact",
  linkScadenze,
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

  const { data: esp } = useEsperienzaPagamentoCliente(cliente?.id);

  const { data: sem } = useSemaforoAffidabilitaCliente(cliente?.id);
  const { data: lightReport } = useLightReportCliente(cliente?.id);

  if (!cliente) return null;

  const fidoAttuale = getFidoAttuale(cliente);
  const lr = testiLightReportRischio(lightReport, fidoAttuale);
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
      <div className="space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <div className="contents">
            <h2 className="min-w-0 break-words text-sm font-semibold">Quadro cliente</h2>
            {linkScadenze}
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

          <span className="min-w-0 text-xs break-words">
            Valutazione esterna: {cliente?.rating_esterno || "n.d."}
            {cliente?.rating_esterno_fonte && <span className="text-[11px] font-normal text-muted-foreground"> {"("}{cliente.rating_esterno_fonte}{cliente.rating_esterno_data ? ` · ${formatDate(cliente.rating_esterno_data)}` : ""}{")"}</span>}
          </span>
          </div>
          <span className="ml-auto min-w-0 break-words text-[11px] text-muted-foreground">Sincronizzato: {ultimaSync}</span>
        </div>
        <div className="grid grid-flow-row-dense grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-x-3 gap-y-1">
          <MetricCard label="Totale rischio" value={formatEuro(totRischio)} />
          <MetricCard label="Scaduto" value={formatEuro(scaduto)} tone={scaduto > 0 ? "destructive" : "success"} />
          <MetricCard label="A scadere" value={formatEuro(Number(cliente.a_scadere ?? 0))} />
          <MetricCard label="Ordini in corso" value={formatEuro(Number(cliente.doc_da_evadere ?? 0))} title="Ordini da evadere — non concorrono al fido" />

          <QuadroCell label="Fido gestionale">
            {formatEuro(fidoAttuale)}
            {ultimoApprovatoImp != null && (
              <span className="text-xs font-normal text-muted-foreground">
                {" · "}ultimo in app: <span className="tabular-nums">{formatEuro(ultimoApprovatoImp)}</span>
                {disallineato && <span className="ml-1 inline-flex rounded-md px-1.5 py-0.5 font-medium bg-warning/15 text-warning border border-warning/30">Da allineare</span>}
              </span>
            )}
          </QuadroCell>
          <MetricCard label="Fido residuo" value={formatEuro(fidoResiduo)} tone={fidoResiduo < 0 ? "destructive" : "neutral"} />
          <MetricCard label={`Fatturato ${annoCorrente}`} value={fatt ? formatEuro(fatt.cur) : "—"} />
          <MetricCard label={`Fatturato ${annoPrec}`} value={fatt ? formatEuro(fatt.prev) : "—"} />
          <QuadroCell label="Cond. pagamento attuale" className="col-span-2">
            <CondizionePagamentoTesto cod={cliente.condizione_pagamento_cod} descFallback={cliente.condizione_pagamento_desc ?? cliente.condizioni_pagamento} />
          </QuadroCell>
          <QuadroCell label="Dilaz. concordata">{cliente.dilazione_concordata ?? "—"}{cliente.dilazione_concordata != null ? " gg" : ""}</QuadroCell>
          <EsperienzaPagamentoCards esp={esp} />
          {lr.payline && (
            <QuadroCell label={lr.payline.label}>
              {lr.payline.valore}
              {lr.payline.dettaglio && <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">{lr.payline.dettaglio}</p>}
            </QuadroCell>
          )}
          {lr.fido && (
            <QuadroCell label={lr.fido.label}>
              {lr.fido.valore}
              {lr.fido.confronto && <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">{lr.fido.confronto}</p>}
            </QuadroCell>
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
        <div className="col-span-2 flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="text-muted-foreground shrink-0">Cond. pagamento attuale</span><span className="min-w-0 break-words sm:text-right"><CondizionePagamentoTesto cod={cliente.condizione_pagamento_cod} descFallback={cliente.condizione_pagamento_desc ?? cliente.condizioni_pagamento} /></span></div>
        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Dilaz. concordata</span><span className="tabular-nums">{cliente.dilazione_concordata ?? "—"}{cliente.dilazione_concordata != null ? " gg" : ""}</span></div>
        {showFatturato && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Fatt. {annoCorrente}</span><span className="tabular-nums">{fatt ? formatEuro(fatt.cur) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fatt. {annoPrec}</span><span className="tabular-nums">{fatt ? formatEuro(fatt.prev) : "—"}</span></div>
          </>
        )}
        <div className="flex justify-between items-center col-span-2"><span className="text-muted-foreground">Semaforo affidabilità</span>
          <SemaforoAffidabilita sem={sem ?? null} />
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
      {lr.payline && <RigaCompatta label={lr.payline.label} valore={lr.payline.valore} dettaglio={lr.payline.dettaglio} />}
      {lr.fido && <RigaCompatta label={lr.fido.label} valore={lr.fido.valore} dettaglio={lr.fido.confronto} />}
      <ValutazioneEsternaBlock cliente={cliente} variant="compact" />
      <div className="border-t pt-1.5 text-muted-foreground">
        Ultima sincronizzazione: {ultimaSync}
      </div>
    </div>
  );
}

function QuadroCell({ label, children, className = "", title }: { label: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={`min-w-0 px-2 py-1 ${className}`} title={title}>
      <p className="text-[10px] leading-tight font-medium text-muted-foreground uppercase break-words">{label}</p>
      <div className="text-sm leading-tight font-semibold tabular-nums break-words">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
  subtext,
  title,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "destructive" | "info" | "success";
  subtext?: string;
  title?: string;
}) {

  const valueTone =
    tone === "destructive" ? "text-destructive" :
    tone === "info" ? "text-info" :
    tone === "success" ? "text-success" : "";
  return (
    <QuadroCell label={label} title={title}>
      <span className={valueTone}>{value}</span>
      {subtext && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
      )}
    </QuadroCell>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 py-0.5 border-b last:border-b-0 border-border/50">
      <span className="min-w-0 break-words text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-foreground font-medium">{children}</span>
    </div>
  );
}

type EspData = EsperienzaPagamento | null | undefined;

/** Variante extended: una sola cella "Pagamenti non puntuali". Testi solo da testiEsperienzaPagamento. */
function EsperienzaPagamentoCards({ esp }: { esp: EspData }) {
  const t = testiEsperienzaPagamento(esp);
  return (
    <QuadroCell label={t.label} title={t.titolo}>
      <span className={t.nonPuntuali12m ? "text-destructive" : ""}>{t.valore}</span>
      {t.dettaglio && <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">{t.dettaglio}</p>}
    </QuadroCell>
  );
}

/** Variante compact: stessa cella, in riga sotto il quadro. */
function EsperienzaPagamentoBlock({ esp }: { esp: EspData; variant: "compact" }) {
  const t = testiEsperienzaPagamento(esp);
  return (
    <div className="border-t pt-1.5 flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2" title={t.titolo}>
      <span className="text-muted-foreground shrink-0">{t.label}</span>
      <span className="min-w-0 break-words sm:text-right">
        <span className={`tabular-nums ${t.nonPuntuali12m ? "text-destructive font-medium" : ""}`}>{t.valore}</span>
        {t.dettaglio && <span className="block text-[11px] text-muted-foreground">{t.dettaglio}</span>}
      </span>
    </div>
  );
}

/** Riga compatta (Light Report) con lo stesso impianto di "Pagamenti non puntuali". */
function RigaCompatta({ label, valore, dettaglio }: { label: string; valore: string; dettaglio: string | null }) {
  return (
    <div className="border-t pt-1.5 flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 break-words sm:text-right">
        <span className="tabular-nums">{valore}</span>
        {dettaglio && <span className="block text-[11px] text-muted-foreground">{dettaglio}</span>}
      </span>
    </div>
  );
}

function ValutazioneEsternaBlock({ cliente, variant }: { cliente: any; variant: "compact" | "extended" }) {
  const rating = cliente?.rating_esterno ?? null;
  const fonte = cliente?.rating_esterno_fonte ?? null;
  const data = cliente?.rating_esterno_data ?? null;
  const vuoto = !rating;

  return (
    <div className={variant === "extended" ? "border-t pt-3 space-y-2" : "border-t pt-1.5 space-y-1"}>
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <h3 className={variant === "extended" ? "font-semibold text-sm" : "font-medium text-xs"}>
          Valutazione esterna
        </h3>
        {fonte && <span className="text-[11px] text-muted-foreground">{fonte}{data ? ` · ${formatDate(data)}` : ""}</span>}
      </div>
      {vuoto ? (
        <p className="text-xs text-muted-foreground">Non disponibile</p>
      ) : (
        <p className="text-sm font-medium">{rating}</p>
      )}
    </div>
  );
}
