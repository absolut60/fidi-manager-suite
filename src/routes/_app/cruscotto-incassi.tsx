import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, TrendingUp, Send, HandCoins, ExternalLink,
  Mail, Download, Search, ChevronDown, ChevronUp, X, Filter, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
import { isRiBa } from "@/lib/spese-insoluto";

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
  scaduto: number;
  a_scadere: number;
  scaduto_riba: number;
  a_scadere_riba: number;
  eccedenza: number;
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
  eccedenza_mese: number;
  insoluto_mese: number;
  scaduto_mese: number;
  a_scadere_mese: number;
  esposizione_scaduta_totale: number;
  n_scadenze_mese: number;
  n_scadenze_pagate_mese: number;
  metodo_prevalente: string | null;
  in_gestione_legale: boolean;
  bloccato: boolean;
  email: string | null;
  pec: string | null;
};

type RigaScadenza = {
  cliente_id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  in_gestione_legale: boolean;
  bloccato: boolean;
  email: string | null;
  pec: string | null;
  scadenza_id: string;
  numero_documento: string | null;
  data_scadenza: string;
  importo_scadenza: number;
  importo_pagato: number;
  quota_incassata: number;
  residuo: number;
  eccedenza: number;
  scaduta: boolean;
  codice_pagamento: string | null;
  metodo_descrizione: string | null;
};

type VistaDettaglio = "scaduto" | "a_scadere" | "incassato";

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
  const [vista, setVista] = useState<VistaDettaglio>("scaduto");
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
    const scaduto = righe.reduce((a, r) => a + Number(r.scaduto), 0);
    const aScadere = righe.reduce((a, r) => a + Number(r.a_scadere), 0);
    const scadutoRiba = righe.reduce((a, r) => a + Number(r.scaduto_riba), 0);
    const aScadereRiba = righe.reduce((a, r) => a + Number(r.a_scadere_riba), 0);
    const eccedenza = righe.reduce((a, r) => a + Number(r.eccedenza || 0), 0);
    const daIncassare = scaduto + aScadere;
    const pct = dovuto > 0 ? Math.min((incassato / dovuto) * 100, 100) : 0;
    return { dovuto, incassato, scaduto, aScadere, scadutoRiba, aScadereRiba, eccedenza, da_incassare: daIncassare, pct };
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

  const { data: scadenze, isLoading: loadingScadenze } = useQuery({
    queryKey: ["cruscotto_incassi_scadenze", anno, meseSel],
    enabled: meseSel != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_cruscotto_incassi_mese_scadenze" as never,
        { _anno: anno, _mese: meseSel! } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaScadenza[]) ?? [];
    },
  });

  const scadenzeFiltrate = useMemo(() => {
    const rows = scadenze ?? [];
    if (vista === "incassato") {
      return rows.filter((r) => Number(r.quota_incassata) > 0)
        .map((r) => ({ ...r, importoVista: Number(r.quota_incassata) }));
    }
    if (vista === "scaduto") {
      return rows.filter((r) => Number(r.residuo) > 0 && r.scaduta)
        .map((r) => ({ ...r, importoVista: Number(r.residuo) }));
    }
    return rows.filter((r) => Number(r.residuo) > 0 && !r.scaduta)
      .map((r) => ({ ...r, importoVista: Number(r.residuo) }));
  }, [scadenze, vista]);

  const totScadutoMese = useMemo(
    () => (dettaglio ?? []).reduce((a, r) => a + Number(r.scaduto_mese || 0), 0),
    [dettaglio],
  );
  const totAScadereMese = useMemo(
    () => (dettaglio ?? []).reduce((a, r) => a + Number(r.a_scadere_mese || 0), 0),
    [dettaglio],
  );
  // "Di cui RiBa": sottoinsieme informativo, non altera il totale
  const { scadutoRiba, aScadereRiba } = useMemo(() => {
    let sr = 0, ar = 0;
    for (const r of scadenze ?? []) {
      if (!isRiBa(r.codice_pagamento) || Number(r.residuo) <= 0) continue;
      if (r.scaduta) sr += Number(r.residuo);
      else ar += Number(r.residuo);
    }
    return { scadutoRiba: sr, aScadereRiba: ar };
  }, [scadenze]);
  const loadingLista = loadingDettaglio || loadingScadenze;

  function apriSollecita(clienteIds: string[]) {
    if (clienteIds.length === 0) {
      toast.info("Nessun cliente da sollecitare");
      return;
    }
    setInvioClienti(clienteIds);
    setInvioMassivoOpen(true);
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <TotBox label="Dovuto anno" value={fmtEuro(totali.dovuto)} />
            <TotBox
              label="Incassato"
              value={fmtEuro(totali.incassato)}
              tone="green"
              sub={totali.eccedenza > 0 ? `eccedenza incassi ${fmtEuro(totali.eccedenza)}` : undefined}
            />
            <TotBox
              label="Scaduto"
              value={fmtEuro(totali.scaduto)}
              tone="red"
              sub={totali.scadutoRiba > 0 ? `di cui RiBa ${fmtEuro(totali.scadutoRiba)}` : undefined}
            />
            <TotBox
              label="A scadere"
              value={fmtEuro(totali.aScadere)}
              tone="amber"
              sub={totali.aScadereRiba > 0 ? `di cui RiBa ${fmtEuro(totali.aScadereRiba)}` : undefined}
            />
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
                        setVista("scaduto");
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
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground tabular-nums">
                  {dettaglioMese.n_pagate} / {dettaglioMese.n_scadenze} scadenze incassate
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setMeseSel(null)}
                  aria-label="Chiudi dettaglio mese"
                  title="Chiudi dettaglio"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* 4 riquadri: Dovuto, Incassato, Scaduto, A scadere */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricButton
                label="Dovuto"
                value={fmtEuro(dettaglioMese.dovuto)}
              />
              <MetricButton
                label="Incassato"
                value={fmtEuro(dettaglioMese.incassato)}
                subLabel={dettaglioMese.eccedenza > 0 ? `eccedenza incassi ${fmtEuro(dettaglioMese.eccedenza)}` : undefined}
                tone="green"
                selected={vista === "incassato"}
                onClick={() => setVista("incassato")}
              />
              <MetricButton
                label="Da incassare — scaduto"
                value={loadingDettaglio ? "…" : fmtEuro(totScadutoMese)}
                subLabel={loadingScadenze ? undefined : `di cui RiBa ${fmtEuro(scadutoRiba)}`}
                tone="red"
                selected={vista === "scaduto"}
                onClick={() => setVista("scaduto")}
              />
              <MetricButton
                label="Da incassare — a scadere"
                value={loadingDettaglio ? "…" : fmtEuro(totAScadereMese)}
                subLabel={loadingScadenze ? undefined : `di cui RiBa ${fmtEuro(aScadereRiba)}`}
                tone="amber"
                selected={vista === "a_scadere"}
                onClick={() => setVista("a_scadere")}
              />
            </div>

            {/* Toolbar liste (solo per da incassare) */}
            {vista !== "incassato" && (() => {
              const clientiUnici = Array.from(
                new Set(scadenzeFiltrate.map((r) => r.cliente_id)),
              );
              return (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => apriSollecita(clientiUnici)}
                    disabled={loadingLista || clientiUnici.length === 0}
                    className="gap-1.5"
                  >
                    <Send className="size-4" /> Sollecita tutti ({clientiUnici.length})
                  </Button>
                  <Button size="sm" variant="outline" disabled className="gap-1.5" title="Funzione in arrivo">
                    <Mail className="size-4" /> Invia riepilogo via mail
                  </Button>
                  <Button size="sm" variant="outline" disabled className="gap-1.5" title="Funzione in arrivo">
                    <Download className="size-4" /> Esporta
                  </Button>
                </div>
              );
            })()}

            {/* Lista raggruppata per cliente, espandibile sulle singole scadenze */}
            {loadingLista ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : (
              <ScadenzeGroupedLista
                righe={scadenzeFiltrate}
                vista={vista}
                onSollecita={(id) => apriSollecita([id])}
                onPromessa={(clienteId, ragione) => {
                  setPromessaClienteId(clienteId);
                  setPromessaLabel(ragione);
                }}
              />
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

type RigaScadenzaVista = RigaScadenza & { importoVista: number };

type GruppoCliente = {
  cliente_id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  in_gestione_legale: boolean;
  bloccato: boolean;
  email: string | null;
  pec: string | null;
  totale: number;
  scadenze: RigaScadenzaVista[];
};

function ScadenzeGroupedLista({
  righe, vista, onSollecita, onPromessa,
}: {
  righe: RigaScadenzaVista[];
  vista: VistaDettaglio;
  onSollecita: (clienteId: string) => void;
  onPromessa: (clienteId: string, ragione: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const gruppi = useMemo<GruppoCliente[]>(() => {
    const map = new Map<string, GruppoCliente>();
    for (const r of righe) {
      let g = map.get(r.cliente_id);
      if (!g) {
        g = {
          cliente_id: r.cliente_id,
          ragione_sociale: r.ragione_sociale,
          codice_gestionale: r.codice_gestionale,
          in_gestione_legale: r.in_gestione_legale,
          bloccato: r.bloccato,
          email: r.email,
          pec: r.pec,
          totale: 0,
          scadenze: [],
        };
        map.set(r.cliente_id, g);
      }
      g.totale += Number(r.importoVista);
      g.scadenze.push(r);
    }
    for (const g of map.values()) {
      g.scadenze.sort((a, b) => (a.data_scadenza < b.data_scadenza ? -1 : 1));
    }
    return Array.from(map.values()).sort((a, b) => b.totale - a.totale);
  }, [righe]);

  if (gruppi.length === 0) {
    const msg =
      vista === "scaduto" ? "Nessuna scadenza scaduta per questo mese."
      : vista === "a_scadere" ? "Nessuna scadenza ancora da maturare per questo mese."
      : "Nessun incasso registrato per questo mese.";
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
        {msg}
      </div>
    );
  }

  const importoLabel =
    vista === "scaduto" ? "Scaduto del mese"
    : vista === "a_scadere" ? "A scadere del mese"
    : "Incassato del mese";
  const importoCls =
    vista === "scaduto" ? "text-red-700"
    : vista === "a_scadere" ? "text-amber-700"
    : "text-emerald-700";
  const tot = gruppi.reduce((a, g) => a + g.totale, 0);
  const showActions = vista !== "incassato";

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Cliente</TableHead>
            <TableHead className="w-24">Cod.</TableHead>
            <TableHead className="text-right whitespace-nowrap">{importoLabel}</TableHead>
            <TableHead className="w-40">Note</TableHead>
            {showActions && <TableHead className="w-32 text-right">Azioni</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gruppi.map((g) => {
            const isOpen = expanded.has(g.cliente_id);
            return (
              <>
                <TableRow
                  key={g.cliente_id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => toggle(g.cliente_id)}
                >
                  <TableCell>
                    {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{g.ragione_sociale}</span>
                      <span className="text-xs text-muted-foreground">
                        ({g.scadenze.length} scadenz{g.scadenze.length === 1 ? "a" : "e"})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {g.codice_gestionale ?? "—"}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", importoCls)}>
                    {fmtEuro(g.totale)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {g.bloccato && (
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                          Bloccato
                        </span>
                      )}
                      {g.in_gestione_legale && (
                        <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5">
                          Legale
                        </span>
                      )}
                      {!g.email && !g.pec && (
                        <span className="rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                          No email
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {showActions && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <IconAction
                          label="Sollecita"
                          onClick={() => onSollecita(g.cliente_id)}
                          icon={<Send className="size-4" />}
                        />
                        <IconAction
                          label="Registra promessa di pagamento"
                          onClick={() => onPromessa(g.cliente_id, g.ragione_sociale)}
                          icon={<HandCoins className="size-4" />}
                        />
                        <IconAction
                          label="Apri scheda cliente"
                          asChild
                          icon={<ExternalLink className="size-4" />}
                        >
                          <Link to="/clienti/$clienteId" params={{ clienteId: g.cliente_id }} />
                        </IconAction>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
                {isOpen && (
                  <TableRow key={`${g.cliente_id}-exp`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={showActions ? 5 : 4} className="py-2">
                      <ScadenzeInnerTable scadenze={g.scadenze} vista={vista} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell colSpan={2} className="font-medium">
              Totale ({gruppi.length} client{gruppi.length === 1 ? "e" : "i"})
            </TableCell>
            <TableCell className={cn("text-right tabular-nums font-semibold", importoCls)}>
              {fmtEuro(tot)}
            </TableCell>
            <TableCell colSpan={showActions ? 2 : 1} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function ScadenzeInnerTable({
  scadenze, vista,
}: {
  scadenze: RigaScadenzaVista[];
  vista: VistaDettaglio;
}) {
  const importoLabel =
    vista === "scaduto" ? "Da incassare"
    : vista === "a_scadere" ? "Da incassare"
    : "Quota incassata";
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Documento</TableHead>
          <TableHead>Data scadenza</TableHead>
          <TableHead className="text-right">{importoLabel}</TableHead>
          <TableHead className="w-28">Metodo</TableHead>
          <TableHead className="w-32">Stato</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scadenze.map((s) => {
          const metodoLabel = isRiBa(s.codice_pagamento)
            ? "RiBa"
            : (s.metodo_descrizione?.trim() || s.codice_pagamento || "—");
          return (
            <TableRow key={s.scadenza_id} className="text-sm">
              <TableCell className="font-mono text-xs">{s.numero_documento ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{fmtDateIt(s.data_scadenza)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtEuro(Number(s.importoVista), 2)}
                {vista === "incassato" && Number(s.residuo) > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (di {fmtEuro(Number(s.importo_scadenza), 2)})
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs">
                <span title={s.codice_pagamento ?? undefined} className="font-medium">
                  {metodoLabel}
                </span>
              </TableCell>
              <TableCell>
                {s.scaduta ? (
                  <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-[11px] font-medium">
                    Scaduto
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[11px] font-medium">
                    A scadere
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function MetodoBadge({ metodo }: { metodo: string | null }) {
  const m = (metodo ?? "Altro").trim();
  const cls =
    m === "RiBa" ? "bg-blue-100 text-blue-800"
    : m === "Bonifico" ? "bg-emerald-100 text-emerald-800"
    : m === "RID" ? "bg-violet-100 text-violet-800"
    : m === "Rimessa" ? "bg-slate-100 text-slate-800"
    : m === "Misto" ? "bg-amber-100 text-amber-800"
    : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>
      {m || "Altro"}
    </span>
  );
}


/* ─── small components ─────────────────────────────────────────────────── */

function TotBox({
  label, value, tone, sub,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "neutral";
  sub?: string;
}) {
  const color =
    tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : tone === "amber" ? "text-amber-700"
    : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", color)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

function MetricButton({
  label, value, subLabel, tone, icon, selected, onClick,
}: {
  label: string;
  value: string;
  subLabel?: string;
  tone?: "green" | "red" | "amber";
  icon?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : tone === "amber" ? "text-amber-700"
    : "text-foreground";
  const selectedRing =
    tone === "red" ? "border-red-500 ring-2 ring-red-500/20 bg-red-500/5"
    : tone === "amber" ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5"
    : tone === "green" ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5"
    : "border-primary ring-2 ring-primary/20 bg-primary/5";
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "text-left rounded-md border px-3 py-2.5 transition-colors",
        clickable ? "cursor-pointer hover:border-primary/50 hover:bg-muted/40" : "cursor-default",
        selected && selectedRing,
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", color)}>{value}</div>
      {subLabel && (
        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{subLabel}</div>
      )}
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
        {!futuro && riga.eccedenza > 0 && (
          <div className="flex items-center justify-between gap-2 -mt-0.5">
            <span className="text-[10px] text-muted-foreground pl-2">eccedenza incassi</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{fmtEuro(riga.eccedenza)}</span>
          </div>
        )}
        <Row label="Scaduto" value={futuro ? "—" : fmtEuro(riga.scaduto)} tone="red" />
        <Row label="A scadere" value={futuro ? "—" : fmtEuro(riga.a_scadere)} tone="amber" />
      </div>
    </button>
  );
}

function Row({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber";
}) {
  const color =
    tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : tone === "amber" ? "text-amber-700"
    : "";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", color)}>{value}</span>
    </div>
  );
}

/* ─── Ricerca Incassi (per data di pagamento) ─────────────────────────── */

type RigaIncassoPeriodo = {
  cliente_id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  n_incassi: number;
  totale_incassato: number;
  n_saldi: number;
  n_parziali: number;
  tipo_prevalente: "saldo" | "parziale";
  ultimo_incasso: string | null;
  metodo_prevalente: string | null;
};

type RigaIncassoDettaglio = {
  scadenza_id: string;
  numero_documento: string | null;
  data_scadenza: string | null;
  importo_scadenza: number;
  importo_pagato: number;
  data_pagamento_effettiva: string;
  codice_pagamento: string | null;
  metodo_descrizione: string | null;
};

function fmtDateIt(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

type Scorciatoia = "oggi" | "mese" | "7gg" | "mese_scorso" | null;

const METODI_OPZIONI = ["RiBa", "Bonifico", "RID", "Rimessa", "Altro"] as const;
type MetodoOpt = (typeof METODI_OPZIONI)[number];
// Default: escludi rimesse dirette (codici S*/RD*/O* → "Rimessa").
const METODI_DEFAULT: MetodoOpt[] = ["RiBa", "Bonifico", "RID", "Altro"];

type SortKey = "cliente" | "n_incassi" | "totale_incassato" | "ultimo_incasso";
type SortDir = "asc" | "desc";

function RicercaIncassiBlock() {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const primoDelMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);

  const [dal, setDal] = useState<string>(toISO(primoDelMese));
  const [al, setAl] = useState<string>(toISO(oggi));
  const [cercaCliente, setCercaCliente] = useState<string>("");
  const [scorciatoia, setScorciatoia] = useState<Scorciatoia>("mese");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [metodi, setMetodi] = useState<MetodoOpt[]>(METODI_DEFAULT);
  const [sortKey, setSortKey] = useState<SortKey>("totale_incassato");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Debounce ricerca cliente
  const [clienteDebounced, setClienteDebounced] = useState("");
  useMemo(() => {
    const t = setTimeout(() => setClienteDebounced(cercaCliente.trim()), 300);
    return () => clearTimeout(t);
  }, [cercaCliente]);

  function applicaScorciatoia(s: Exclude<Scorciatoia, null>) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (s === "oggi") {
      setDal(toISO(now)); setAl(toISO(now));
    } else if (s === "mese") {
      setDal(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
      setAl(toISO(now));
    } else if (s === "7gg") {
      const start = new Date(now); start.setDate(start.getDate() - 6);
      setDal(toISO(start)); setAl(toISO(now));
    } else if (s === "mese_scorso") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setDal(toISO(start)); setAl(toISO(end));
    }
    setScorciatoia(s);
    setExpanded(new Set());
  }

  const { data: righe, isLoading, isFetching } = useQuery({
    queryKey: ["ricerca_incassi_periodo", dal, al, clienteDebounced],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_incassi_periodo" as never,
        { _dal: dal, _al: al, _cliente_search: clienteDebounced || null } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaIncassoPeriodo[]) ?? [];
    },
    enabled: !!dal && !!al && dal <= al,
  });

  const totali = useMemo(() => {
    const rows = righe ?? [];
    return {
      totale: rows.reduce((a, r) => a + Number(r.totale_incassato ?? 0), 0),
      n_incassi: rows.reduce((a, r) => a + Number(r.n_incassi ?? 0), 0),
      n_clienti: rows.length,
    };
  }, [righe]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  const periodoValido = dal && al && dal <= al;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Ricerca incassi
          </div>
          <div className="text-lg font-semibold flex items-center gap-2">
            <Search className="size-5 text-primary" />
            Cassa entrata per periodo
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Criterio: data di pagamento effettivo (diverso dall'andamento mensile, che va per data di scadenza).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled className="gap-1.5" title="Funzione in arrivo">
            <Mail className="size-4" /> Invia riepilogo
          </Button>
          <Button size="sm" variant="outline" disabled className="gap-1.5" title="Funzione in arrivo">
            <Download className="size-4" /> Esporta
          </Button>
        </div>
      </div>

      {/* Filtri */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["oggi", "Oggi"],
            ["mese", "Questo mese"],
            ["7gg", "Ultimi 7 giorni"],
            ["mese_scorso", "Mese scorso"],
          ] as const).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={scorciatoia === k ? "default" : "outline"}
              className="h-8"
              onClick={() => applicaScorciatoia(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Dal</label>
            <Input
              type="date"
              value={dal}
              onChange={(e) => { setDal(e.target.value); setScorciatoia(null); setExpanded(new Set()); }}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Al</label>
            <Input
              type="date"
              value={al}
              onChange={(e) => { setAl(e.target.value); setScorciatoia(null); setExpanded(new Set()); }}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">Cerca cliente</label>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={cercaCliente}
                onChange={(e) => setCercaCliente(e.target.value)}
                placeholder="Ragione sociale o codice…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>
        {!periodoValido && (
          <p className="text-xs text-red-600">Il periodo non è valido: la data "Dal" deve precedere o coincidere con "Al".</p>
        )}
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Cliente</TableHead>
              <TableHead className="w-24">Cod.</TableHead>
              <TableHead className="text-right w-24">N. incassi</TableHead>
              <TableHead className="text-right w-40">Totale incassato</TableHead>
              <TableHead className="w-28">Metodo</TableHead>
              <TableHead className="w-28">Tipo prev.</TableHead>
              <TableHead className="w-32">Ultimo incasso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : (righe ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                  Nessun incasso nel periodo selezionato.
                </TableCell>
              </TableRow>
            ) : (
              (righe ?? []).map((r) => {
                const isOpen = expanded.has(r.cliente_id);
                return (
                  <>
                    <TableRow
                      key={r.cliente_id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggle(r.cliente_id)}
                    >
                      <TableCell>
                        {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.ragione_sociale}</span>
                          <Link
                            to="/clienti/$clienteId"
                            params={{ clienteId: r.cliente_id }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
                            title="Apri scheda cliente"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.codice_gestionale ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.n_incassi}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmtEuro(Number(r.totale_incassato), 2)}
                      </TableCell>
                      <TableCell>
                        <MetodoBadge metodo={r.metodo_prevalente} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            r.tipo_prevalente === "saldo"
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : "bg-amber-100 text-amber-800 hover:bg-amber-100",
                          )}
                        >
                          {r.tipo_prevalente === "saldo" ? "Saldo" : "Parziale"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtDateIt(r.ultimo_incasso)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${r.cliente_id}-exp`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={7} className="py-2">
                          <DettaglioIncassiCliente
                            clienteId={r.cliente_id}
                            dal={dal}
                            al={al}
                            totaleAtteso={Number(r.totale_incassato)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
          {(righe ?? []).length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">Totale generale</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums font-semibold">{totali.n_incassi}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtEuro(totali.totale, 2)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground" colSpan={3}>
                  {totali.n_clienti} client{totali.n_clienti === 1 ? "e" : "i"}
                  {isFetching ? " · aggiornamento…" : ""}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </Card>
  );
}

function DettaglioIncassiCliente({
  clienteId, dal, al, totaleAtteso,
}: {
  clienteId: string; dal: string; al: string; totaleAtteso: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["ricerca_incassi_dettaglio", clienteId, dal, al],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_incassi_periodo_dettaglio" as never,
        { _dal: dal, _al: al, _cliente_id: clienteId } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaIncassoDettaglio[]) ?? [];
    },
  });

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  const righe = data ?? [];
  const somma = righe.reduce((a, r) => a + Number(r.importo_pagato ?? 0), 0);
  const scostamento = Math.abs(somma - totaleAtteso);

  return (
    <div className="space-y-1.5">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead>Documento</TableHead>
            <TableHead>Data scadenza</TableHead>
            <TableHead className="text-right">Importo scadenza</TableHead>
            <TableHead className="text-right">Quota incassata</TableHead>
            <TableHead>Data pagamento</TableHead>
            <TableHead>Metodo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((r) => {
            const parziale = Number(r.importo_pagato) < Number(r.importo_scadenza);
            const metodoLabel = isRiBa(r.codice_pagamento)
              ? "RiBa"
              : (r.metodo_descrizione?.trim() || r.codice_pagamento || "—");
            return (
              <TableRow key={r.scadenza_id} className="text-sm">
                <TableCell className="font-mono text-xs">{r.numero_documento ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmtDateIt(r.data_scadenza)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEuro(Number(r.importo_scadenza), 2)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={cn(parziale && "text-amber-700 font-medium")}>
                    {fmtEuro(Number(r.importo_pagato), 2)}
                  </span>
                  {parziale && <span className="text-xs text-muted-foreground ml-1">(parziale)</span>}
                </TableCell>
                <TableCell className="tabular-nums">{fmtDateIt(r.data_pagamento_effettiva)}</TableCell>
                <TableCell className="text-xs">
                  <span title={r.codice_pagamento ?? undefined} className="font-medium">
                    {metodoLabel}
                  </span>
                  {r.codice_pagamento && !isRiBa(r.codice_pagamento) && r.metodo_descrizione && (
                    <span className="ml-1 text-muted-foreground font-mono">({r.codice_pagamento})</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="text-xs text-muted-foreground">
              {righe.length} scadenz{righe.length === 1 ? "a" : "e"} incassat{righe.length === 1 ? "a" : "e"} nel periodo
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">{fmtEuro(somma, 2)}</TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
      {scostamento > 0.01 && (
        <p className="text-xs text-amber-700">
          ⚠ Scostamento dal totale riga cliente: {fmtEuro(scostamento, 2)}
        </p>
      )}
    </div>
  );
}

