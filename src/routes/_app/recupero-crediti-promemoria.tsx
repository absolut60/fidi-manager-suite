import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  MailX,
  Search,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";

export const Route = createFileRoute("/_app/recupero-crediti-promemoria")({
  component: PromemoriaScadenzaPage,
});

const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function meseKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function meseLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MESI_IT[Number(m) - 1]} ${y}`;
}
function buildMesiRosa(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setMonth(base.getMonth() + i);
    out.push(meseKey(d));
  }
  return out;
}

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleDateString("it-IT");
  } catch {
    return String(v);
  }
}

type ClientePromemoria = {
  cliente_id: string;
  ragione_sociale: string;
  store_id: string | null;
  store_nome: string | null;
  email: string | null;
  pec: string | null;
  bloccato: boolean;
  n_scadenze: number;
  totale_a_scadere: number;
  prima_scadenza: string;
};

function PromemoriaScadenzaPage() {
  const { role, profilo } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;

  const mesiRosa = useMemo(() => buildMesiRosa(6), []);
  const [mesiSel, setMesiSel] = useState<Set<string>>(() => new Set([mesiRosa[0]]));
  const [storeId, setStoreId] = useState<string>(
    isStoreManager && myStoreId ? myStoreId : "all"
  );
  const [search, setSearch] = useState("");
  const [searchDeb, setSearchDeb] = useState("");
  const [importoMin, setImportoMin] = useState<string>("");
  const [escludiLegale, setEscludiLegale] = useState(true);
  const [escludiBloccati, setEscludiBloccati] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mesiArr = useMemo(() => Array.from(mesiSel).sort(), [mesiSel]);

  const aggQuery = useQuery({
    queryKey: [
      "promemoria-clienti-agg",
      mesiArr,
      storeId,
      searchDeb,
      importoMin,
      escludiLegale,
      escludiBloccati,
    ],
    enabled: mesiArr.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_promemoria_clienti_aggregato" as never,
        {
          _mesi: mesiArr,
          _store_id: storeId !== "all" ? storeId : null,
          _search: searchDeb || null,
          _importo_min: importoMin ? Number(importoMin) : null,
          _escludi_legale: escludiLegale,
          _escludi_bloccati: escludiBloccati,
        } as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as ClientePromemoria[];
    },
  });

  const rows = aggQuery.data ?? [];
  const totClienti = rows.length;
  const totImporto = rows.reduce((s, r) => s + Number(r.totale_a_scadere ?? 0), 0);
  const totScadenze = rows.reduce((s, r) => s + (r.n_scadenze ?? 0), 0);

  function toggleMese(k: string) {
    setMesiSel((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      if (n.size === 0) n.add(k);
      return n;
    });
  }

  function toggleSel(id: string) {
    setSelezionati((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selezionati.has(r.cliente_id));
  function toggleSelectAll() {
    if (allSelected) setSelezionati(new Set());
    else setSelezionati(new Set(rows.map((r) => r.cliente_id)));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="size-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Promemoria di scadenza</h1>
          <p className="text-sm text-muted-foreground">
            Avvisi di cortesia su scadenze future — distinti dai solleciti sullo scaduto
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/recupero-crediti">Torna a Recupero Crediti</Link>
        </Button>
      </div>

      {/* Filtri */}
      <Card className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Mesi di scadenza
          </div>
          <div className="flex flex-wrap gap-2">
            {mesiRosa.map((k) => {
              const active = mesiSel.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleMese(k)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-foreground border-border"
                  )}
                >
                  {meseLabel(k)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Cerca ragione sociale…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {!isStoreManager && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli store</SelectItem>
                {(stores ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            type="number"
            placeholder="Importo minimo (€)"
            value={importoMin}
            onChange={(e) => setImportoMin(e.target.value)}
            min={0}
          />

          <div className="flex flex-col gap-2 justify-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={escludiLegale}
                onCheckedChange={(v) => setEscludiLegale(v === true)}
              />
              Escludi scadenze in gestione legale
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={escludiBloccati}
                onCheckedChange={(v) => setEscludiBloccati(v === true)}
              />
              Escludi clienti bloccati
            </label>
          </div>
        </div>
      </Card>

      {/* Riepilogo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Clienti trovati" value={totClienti} loading={aggQuery.isLoading} />
        <MetricCard label="Scadenze nel periodo" value={totScadenze} loading={aggQuery.isLoading} />
        <MetricCard label="Totale a scadere" value={fmtEuro(totImporto)} loading={aggQuery.isLoading} tone="primary" />
      </div>

      {/* Tabella */}
      <Card>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm text-muted-foreground">
            {selezionati.size > 0
              ? `${selezionati.size} cliente/i selezionato/i`
              : "Seleziona i clienti per il prossimo invio"}
          </div>
          {selezionati.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelezionati(new Set())}>
              Azzera selezione
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Seleziona tutti i filtrati"
                  />
                </TableHead>
                <TableHead className="w-10" />
                <TableHead>Cliente</TableHead>
                <TableHead>Store</TableHead>
                <TableHead className="text-center">N. scadenze</TableHead>
                <TableHead className="text-right">Totale a scadere</TableHead>
                <TableHead>Prima scadenza</TableHead>
                <TableHead>Email / PEC</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-24 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {!aggQuery.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Nessun cliente con scadenze a scadere nei mesi selezionati
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const isExp = expanded === r.cliente_id;
                const hasMail = !!(r.email || r.pec);
                return (
                  <Fragment key={r.cliente_id}>
                    <TableRow className="hover:bg-muted/40">
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selezionati.has(r.cliente_id)}
                          onCheckedChange={() => toggleSel(r.cliente_id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setExpanded(isExp ? null : r.cliente_id)}
                        >
                          {isExp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.ragione_sociale}</span>
                          {r.bloccato && <Badge variant="destructive">Bloccato</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.store_nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{r.n_scadenze}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {fmtEuro(r.totale_a_scadere)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDate(r.prima_scadenza)}
                      </TableCell>
                      <TableCell>
                        {hasMail ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="size-3.5" />
                            {r.email || r.pec}
                          </span>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <MailX className="size-3" /> Manca email
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon" className="size-7" title="Apri scheda cliente">
                          <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }}>
                            <ExternalLink className="size-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExp && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={9}>
                          <ScadenzeDettaglio clienteId={r.cliente_id} mesi={mesiArr} escludiLegale={escludiLegale} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function ScadenzeDettaglio({
  clienteId,
  mesi,
  escludiLegale,
}: {
  clienteId: string;
  mesi: string[];
  escludiLegale: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, isLoading } = useQuery({
    queryKey: ["promemoria-dettaglio", clienteId, mesi, escludiLegale],
    queryFn: async () => {
      let q = supabase
        .from("scadenze")
        .select("id, numero_documento, data_documento, data_scadenza, importo_scadenza, in_legale, tempi_scadenza")
        .eq("cliente_id", clienteId)
        .ilike("tempi_scadenza", "%scader%")
        .gte("data_scadenza", today.toISOString().slice(0, 10))
        .order("data_scadenza", { ascending: true });
      if (escludiLegale) q = q.eq("in_legale", false);
      const { data, error } = await q;
      if (error) throw error;
      const filtered = (data ?? []).filter((s) => {
        if (!s.data_scadenza) return false;
        const k = s.data_scadenza.slice(0, 7);
        return mesi.includes(k);
      });
      return filtered;
    },
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!data || data.length === 0)
    return <div className="text-sm text-muted-foreground p-2">Nessun dettaglio</div>;

  const tot = data.reduce((s, r) => s + Number(r.importo_scadenza ?? 0), 0);

  return (
    <div className="p-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Data doc.</TableHead>
            <TableHead>Scadenza</TableHead>
            <TableHead className="text-right">Importo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-sm">{s.numero_documento ?? "—"}</TableCell>
              <TableCell className="text-sm">{s.data_documento ? new Date(s.data_documento).toLocaleDateString("it-IT") : "—"}</TableCell>
              <TableCell className="text-sm">{s.data_scadenza ? new Date(s.data_scadenza).toLocaleDateString("it-IT") : "—"}</TableCell>
              <TableCell className="text-right text-sm font-medium">{fmtEuro(s.importo_scadenza)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} className="text-right font-medium">Totale</TableCell>
            <TableCell className="text-right font-semibold">{fmtEuro(tot)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function MetricCard({
  label, value, loading, tone = "default",
}: {
  label: string; value: string | number; loading?: boolean;
  tone?: "default" | "primary";
}) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="h-8 w-24 mt-1" />
      ) : (
        <div className={cn("text-2xl font-semibold mt-1", tone === "primary" && "text-primary")}>{value}</div>
      )}
    </Card>
  );
}
