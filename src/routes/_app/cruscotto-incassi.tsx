import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, TrendingUp, Send, HandCoins, ExternalLink,
  Mail, Download, Users, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";
import { RegistraPromessaDialog } from "@/components/registra-promessa-dialog";

export const Route = createFileRoute("/_app/cruscotto-incassi")({
  component: CruscottoIncassiPage,
});

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

type RigaMese = {
  mese: number;
  dovuto: number;
  incassato: number;
  da_incassare: number;
  pct: number;
  n_scadenze: number;
  n_pagate: number;
};

type RigaDettaglio = {
  cliente_id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  store_id: string | null;
  store_nome: string | null;
  dovuto_mese: number;
  incassato_mese: number;
  insoluto_mese: number;
  esposizione_scaduta_totale: number;
  n_scadenze_mese: number;
  n_scadenze_pagate_mese: number;
  in_gestione_legale: boolean;
  bloccato: boolean;
  email: string | null;
  pec: string | null;
};

function fmtEuro(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: decimals,
  }).format(n);
}
function fmtPct(n: number) {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function CruscottoIncassiPage() {
  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1;
  const annoCorrente = oggi.getFullYear();
  const [anno, setAnno] = useState<number>(annoCorrente);
  const [meseSel, setMeseSel] = useState<number | null>(null);
  const [vista, setVista] = useState<"da_incassare" | "incassato">("da_incassare");
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);
  const [invioClienti, setInvioClienti] = useState<string[]>([]);
  const [promessaClienteId, setPromessaClienteId] = useState<string | null>(null);
  const [promessaLabel, setPromessaLabel] = useState<string>("");

  const { data: mensile, isLoading } = useQuery({
    queryKey: ["cruscotto_incassi_mensile", anno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_cruscotto_incassi_mensile" as never,
        { _anno: anno } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaMese[]) ?? [];
    },
  });

  const righe = mensile ?? [];
  const totali = useMemo(() => {
    const dovuto = righe.reduce((a, r) => a + Number(r.dovuto), 0);
    const incassato = righe.reduce((a, r) => a + Number(r.incassato), 0);
    return {
      dovuto,
      incassato,
      da_incassare: Math.max(dovuto - incassato, 0),
      pct: dovuto > 0 ? Math.min((incassato / dovuto) * 100, 100) : 0,
    };
  }, [righe]);

  const dettaglioMese = meseSel != null ? righe.find((r) => r.mese === meseSel) : null;

  const { data: dettaglio, isLoading: loadingDettaglio } = useQuery({
    queryKey: ["cruscotto_incassi_dettaglio", anno, meseSel],
    enabled: meseSel != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_cruscotto_incassi_mese_dettaglio" as never,
        { _anno: anno, _mese: meseSel! } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaDettaglio[]) ?? [];
    },
  });

  const daIncassare = useMemo(
    () => (dettaglio ?? []).filter((r) => Number(r.insoluto_mese) > 0),
    [dettaglio],
  );
  const incassato = useMemo(
    () => (dettaglio ?? []).filter((r) => Number(r.incassato_mese) > 0),
    [dettaglio],
  );

  function apriSollecita(clienteIds: string[]) {
    if (clienteIds.length === 0) {
      toast.info("Nessun cliente da sollecitare");
      return;
    }
    setInvioClienti(clienteIds);
    setInvioMassivoOpen(true);
  }

  function apriPromessa(r: RigaDettaglio) {
    setPromessaClienteId(r.cliente_id);
    setPromessaLabel(r.ragione_sociale);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <TrendingUp className="size-6 text-primary" />
              Cruscotto incassi
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Andamento mensile per data di scadenza — valori vivi, ricalcolati a ogni apertura.
            </p>
          </div>
          <div className="flex items-center gap-1 border rounded-md bg-background">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => { setAnno(anno - 1); setMeseSel(null); }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="px-3 text-sm font-semibold tabular-nums min-w-[3.5rem] text-center">
              {anno}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => { setAnno(anno + 1); setMeseSel(null); }}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Totali anno */}
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TotBox label="Dovuto anno" value={fmtEuro(totali.dovuto)} />
            <TotBox label="Incassato" value={fmtEuro(totali.incassato)} tone="green" />
            <TotBox label="Da incassare" value={fmtEuro(totali.da_incassare)} tone="red" />
            <TotBox label="% incassato" value={fmtPct(totali.pct)} tone="neutral" />
          </div>
        </Card>

        {/* Griglia mesi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))
            : righe.map((r) => {
                const futuro =
                  anno > annoCorrente || (anno === annoCorrente && r.mese > meseCorrente);
                const corrente = anno === annoCorrente && r.mese === meseCorrente;
                const attivo = meseSel === r.mese;
                return (
                  <MeseCard
                    key={r.mese}
                    riga={r}
                    futuro={futuro}
                    corrente={corrente}
                    attivo={attivo}
                    onClick={() => {
                      if (attivo) {
                        setMeseSel(null);
                      } else {
                        setMeseSel(r.mese);
                        setVista("da_incassare");
                      }
                    }}
                  />
                );
              })}
        </div>

        {/* Dettaglio mese selezionato */}
        {dettaglioMese && (
          <Card className="p-5 space-y-5">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dettaglio mese
                </div>
                <div className="text-lg font-semibold">
                  {MESI[dettaglioMese.mese - 1]} {anno}
                </div>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {dettaglioMese.n_pagate} / {dettaglioMese.n_scadenze} scadenze incassate
              </div>
            </div>

            {/* 4 riquadri: due cliccabili come selettori */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricButton
                label="Dovuto"
                value={fmtEuro(dettaglioMese.dovuto)}
              />
              <MetricButton
                label="Incassato"
                value={fmtEuro(dettaglioMese.incassato)}
                tone="green"
                selected={vista === "incassato"}
                onClick={() => setVista("incassato")}
              />
              <MetricButton
                label="Da incassare"
                value={fmtEuro(dettaglioMese.da_incassare)}
                tone="red"
                selected={vista === "da_incassare"}
                onClick={() => setVista("da_incassare")}
              />
              <MetricButton
                label="N. clienti coinvolti"
                value={String(loadingDettaglio ? "…" : (dettaglio?.length ?? 0))}
                icon={<Users className="size-4" />}
              />
            </div>

            {/* Toolbar liste */}
            {vista === "da_incassare" && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => apriSollecita(daIncassare.map((r) => r.cliente_id))}
                  disabled={loadingDettaglio || daIncassare.length === 0}
                  className="gap-1.5"
                >
                  <Send className="size-4" /> Sollecita tutti ({daIncassare.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="gap-1.5"
                  title="Funzione in arrivo"
                >
                  <Mail className="size-4" /> Invia riepilogo via mail
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="gap-1.5"
                  title="Funzione in arrivo"
                >
                  <Download className="size-4" /> Esporta
                </Button>
              </div>
            )}

            {/* Lista */}
            {loadingDettaglio ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : vista === "da_incassare" ? (
              <DaIncassareLista
                righe={daIncassare}
                onSollecita={(id) => apriSollecita([id])}
                onPromessa={apriPromessa}
              />
            ) : (
              <IncassatoLista righe={incassato} />
            )}
          </Card>
        )}
        {/* ─── Ricerca incassi (per data di pagamento) ─── */}
        <RicercaIncassiBlock />

        <InvioMassivoDialog
          open={invioMassivoOpen}
          onOpenChange={(v) => {
            setInvioMassivoOpen(v);
            if (!v) setInvioClienti([]);
          }}
          clienteIdsSelezionati={invioClienti}
          clienteIdsFiltrati={invioClienti}
        />
        {promessaClienteId && (
          <RegistraPromessaDialog
            open={!!promessaClienteId}
            onOpenChange={(v) => { if (!v) setPromessaClienteId(null); }}
            clienteId={promessaClienteId}
            clienteLabel={promessaLabel}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

/* ─── UI blocks ────────────────────────────────────────────────────────── */

function DaIncassareLista({
  righe, onSollecita, onPromessa,
}: {
  righe: RigaDettaglio[];
  onSollecita: (clienteId: string) => void;
  onPromessa: (r: RigaDettaglio) => void;
}) {
  if (righe.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
        Nessun cliente con insoluto per questo mese.
      </div>
    );
  }
  const tot_insoluto = righe.reduce((a, r) => a + Number(r.insoluto_mese), 0);
  const tot_esposizione = righe.reduce((a, r) => a + Number(r.esposizione_scaduta_totale), 0);
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-24">Cod.</TableHead>
            <TableHead className="text-right whitespace-nowrap">Insoluto del mese</TableHead>
            <TableHead className="text-right whitespace-nowrap">Esposizione scaduta totale</TableHead>
            <TableHead className="w-40">Note</TableHead>
            <TableHead className="w-32 text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((r) => (
            <TableRow key={r.cliente_id}>
              <TableCell className="font-medium">
                <Link
                  to="/clienti/$clienteId"
                  params={{ clienteId: r.cliente_id }}
                  className="text-primary hover:underline"
                >
                  {r.ragione_sociale}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs font-mono">
                {r.codice_gestionale ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {fmtEuro(Number(r.insoluto_mese))}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium text-red-700">
                {fmtEuro(Number(r.esposizione_scaduta_totale))}
              </TableCell>
              <TableCell className="text-xs">
                <div className="flex flex-wrap gap-1">
                  {r.bloccato && (
                    <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                      Bloccato
                    </span>
                  )}
                  {r.in_gestione_legale && (
                    <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5">
                      Legale
                    </span>
                  )}
                  {!r.email && !r.pec && (
                    <span className="rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                      No email
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <IconAction
                    label="Sollecita"
                    onClick={() => onSollecita(r.cliente_id)}
                    icon={<Send className="size-4" />}
                  />
                  <IconAction
                    label="Registra promessa di pagamento"
                    onClick={() => onPromessa(r)}
                    icon={<HandCoins className="size-4" />}
                  />
                  <IconAction
                    label="Apri scheda cliente"
                    asChild
                    icon={<ExternalLink className="size-4" />}
                  >
                    <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} />
                  </IconAction>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="font-medium">
              Totale ({righe.length} clienti)
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {fmtEuro(tot_insoluto)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold text-red-700">
              {fmtEuro(tot_esposizione)}
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function IncassatoLista({ righe }: { righe: RigaDettaglio[] }) {
  if (righe.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
        Nessun incasso registrato per questo mese.
      </div>
    );
  }
  const tot = righe.reduce((a, r) => a + Number(r.incassato_mese), 0);
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-24">Cod.</TableHead>
            <TableHead className="text-right">Incassato del mese</TableHead>
            <TableHead className="w-32">Tipo</TableHead>
            <TableHead className="w-24 text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((r) => {
            const dov = Number(r.dovuto_mese);
            const inc = Number(r.incassato_mese);
            const tipo = inc + 0.005 >= dov
              ? { label: "Saldo", cls: "bg-emerald-100 text-emerald-800" }
              : { label: "Parziale", cls: "bg-amber-100 text-amber-800" };
            return (
              <TableRow key={r.cliente_id}>
                <TableCell className="font-medium">
                  <Link
                    to="/clienti/$clienteId"
                    params={{ clienteId: r.cliente_id }}
                    className="text-primary hover:underline"
                  >
                    {r.ragione_sociale}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono">
                  {r.codice_gestionale ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                  {fmtEuro(inc)}
                </TableCell>
                <TableCell>
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", tipo.cls)}>
                    {tipo.label}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <IconAction
                      label="Apri scheda cliente"
                      asChild
                      icon={<ExternalLink className="size-4" />}
                    >
                      <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} />
                    </IconAction>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="font-medium">
              Totale ({righe.length} clienti)
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
              {fmtEuro(tot)}
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/* ─── small components ─────────────────────────────────────────────────── */

function TotBox({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "neutral";
}) {
  const color =
    tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", color)}>{value}</div>
    </div>
  );
}

function MetricButton({
  label, value, tone, icon, selected, onClick,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
  icon?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : "text-foreground";
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "text-left rounded-md border px-3 py-2.5 transition-colors",
        clickable ? "cursor-pointer hover:border-primary/50 hover:bg-muted/40" : "cursor-default",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", color)}>{value}</div>
    </button>
  );
}

function IconAction({
  label, onClick, icon, asChild, children,
}: {
  label: string;
  onClick?: () => void;
  icon: React.ReactNode;
  asChild?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClick}
          asChild={asChild}
        >
          {asChild ? <span>{children}{icon}</span> : icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MeseCard({
  riga, futuro, corrente, attivo, onClick,
}: {
  riga: RigaMese;
  futuro: boolean;
  corrente: boolean;
  attivo: boolean;
  onClick: () => void;
}) {
  const pct = Number(riga.pct);
  const badgeTone = futuro
    ? "bg-muted text-muted-foreground"
    : corrente
      ? "bg-primary/10 text-primary"
      : pct >= 90
        ? "bg-emerald-100 text-emerald-800"
        : pct >= 60
          ? "bg-amber-100 text-amber-800"
          : "bg-muted text-muted-foreground";
  const barPct = futuro ? 0 : Math.min(pct, 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:border-primary/40",
        attivo && "border-primary ring-2 ring-primary/20",
        futuro && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{MESI[riga.mese - 1]}</div>
        <span
          className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums",
            badgeTone,
          )}
        >
          {futuro ? "—" : fmtPct(pct)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-red-100 overflow-hidden mb-3">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="space-y-1 text-xs">
        <Row label="Dovuto" value={fmtEuro(riga.dovuto)} />
        <Row label="Incassato" value={futuro ? "—" : fmtEuro(riga.incassato)} tone="green" />
        <Row label="Da incassare" value={futuro ? "—" : fmtEuro(riga.da_incassare)} tone="red" />
      </div>
    </button>
  );
}

function Row({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", color)}>{value}</span>
    </div>
  );
}
