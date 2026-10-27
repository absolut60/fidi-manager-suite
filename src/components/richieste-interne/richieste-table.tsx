import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, MessageSquare, Paperclip, Search } from "lucide-react";
import { SchedaLista, ElencoSchede, type CampoScheda } from "@/components/lista-responsive";
import { puoGestireTesoreria } from "@/lib/tesoreria-permessi";
import { cn } from "@/lib/utils";
import {
  STILE_ACCONTO, stileAdmin, stilePrincipale, stileStatus, stileTipo, type StileVoce,
} from "./stili";

// Re-export per compatibilità: la fonte unica è ./stili.
export { STATUS_LABEL, ADMIN_LABEL, TIPO_LABEL } from "./stili";

export function BadgeStile({ stile, testo, className }: { stile: StileVoce; testo?: React.ReactNode; className?: string }) {
  const Icona = stile.icona;
  return (
    <Badge variant="outline" className={cn("w-fit gap-1 font-medium", stile.badge, className)}>
      <Icona className="size-3 shrink-0" aria-hidden />
      <span className="break-words">{testo ?? stile.label}</span>
    </Badge>
  );
}

export type RichiestaRow = {
  id: string;
  title: string;
  description: string | null;
  requester_name: string;
  sede_name: string | null;
  type: string;
  fornitore: string | null;
  amount: number | null;
  status: string;
  admin_status: string | null;
  admin_note?: string | null;
  sent_to_gestionale?: boolean | null;
  gestionale_ref?: string | null;
  created_at: string;
  archived_by_name?: string | null;
  archived_at?: string | null;
  richieste_interne_allegati?: Array<{ id: string }> | null;
  acconto_richiesto?: boolean | null;
  acconto_importo?: number | null;
  acconto_stato?: string | null;
};

/** Bonifico di acconto da eseguire: richiesto, da_eseguire, richiesta approvata. */
export function isBonificoDaEseguire(r: Pick<RichiestaRow, "acconto_richiesto" | "acconto_stato" | "status">): boolean {
  return !!r.acconto_richiesto && r.acconto_stato === "da_eseguire" && (r.status === "resp_approved" || r.status === "approved");
}

function BadgeAcconto({ r }: { r: RichiestaRow }) {
  if (!r.acconto_richiesto) return null;
  const eseguito = r.acconto_stato === "eseguito";
  return (
    <BadgeStile
      stile={eseguito ? STILE_ACCONTO.eseguito : STILE_ACCONTO.da_eseguire}
      testo={`${eseguito ? "✓ " : ""}Acconto ${fmtEuro(r.acconto_importo ?? null)}`}
    />
  );
}

type SortKey =
  | "title"
  | "requester"
  | "sede"
  | "type"
  | "fornitore"
  | "amount"
  | "allegati"
  | "status"
  | "created_at"
  | "archived_at";

export type Periodo = "tutto" | "7" | "30" | "90";

const fmtEuro = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtData = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("it-IT") : "—");

export function RichiesteTable({
  rows,
  isLoading,
  showAdminBadge = true,
  showArchivedColumns = false,
  defaultSortKey = "created_at",
  emptyLabel = "Nessuna richiesta",
  unreadIds,
  onGestisci,
  onRipristina,
  gestisciLabel = "Gestisci",
  chiaveFiltri,
  filtroBonificiDefault = false,
  defaultPeriodo = "tutto",
  nascondiRichiedente = false,
}: {
  rows: RichiestaRow[] | undefined;
  isLoading: boolean;
  showAdminBadge?: boolean;
  showArchivedColumns?: boolean;
  defaultSortKey?: SortKey;
  emptyLabel?: string;
  unreadIds?: Set<string>;
  onGestisci?: (r: RichiestaRow) => void;
  onRipristina?: (r: RichiestaRow) => void;
  gestisciLabel?: string;
  /** Chiave distinta per vista per conservare i filtri (es. "richieste-interne:tutte"). */
  chiaveFiltri: string;
  /** Apre la vista già filtrata su "Bonifici da eseguire" (es. utenti solo tesoreria). */
  filtroBonificiDefault?: boolean;
  /** Periodo iniziale se l'utente non ha ancora una scelta salvata. */
  defaultPeriodo?: Periodo;
  /** Nasconde la colonna/campo Richiedente (es. "Le mie richieste"). */
  nascondiRichiedente?: boolean;
}) {
  const navigate = useNavigate();
  const openDetail = (id: string) => navigate({ to: "/richieste-interne/$richiestaId", params: { richiestaId: id } });
  // Filtri e ordinamento conservati (useFiltriPagina), una chiave per vista.
  const { user, roles } = useAuth();
  const isTesoreria = puoGestireTesoreria(roles);
  const { filtri: FR, setCampo } = useFiltriPagina(chiaveFiltri, {
    q: "", periodo: defaultPeriodo as Periodo, sortKey: defaultSortKey as SortKey, sortDir: "desc" as "asc" | "desc",
    soloBonifici: filtroBonificiDefault,
  }, { userId: user?.id });
  const { q, periodo, sortKey, sortDir, soloBonifici } = FR;
  const nBonifici = useMemo(() => (rows ?? []).filter(isBonificoDaEseguire).length, [rows]);
  const setQ = (v: string) => setCampo("q", v);
  const setPeriodo = (v: Periodo) => setCampo("periodo", v);
  const setSortKey = (v: SortKey) => setCampo("sortKey", v);
  const setSortDir = (v: "asc" | "desc" | ((d: "asc" | "desc") => "asc" | "desc")) => setCampo("sortDir", v);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cutoff =
      periodo === "tutto" ? null : Date.now() - Number(periodo) * 24 * 60 * 60 * 1000;
    const base = (rows ?? []).filter((r) => {
      if (soloBonifici && !isBonificoDaEseguire(r)) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (s) {
        const hit =
          r.title?.toLowerCase().includes(s) ||
          r.description?.toLowerCase().includes(s) ||
          r.requester_name?.toLowerCase().includes(s);
        if (!hit) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = valForSort(a, sortKey);
      const vb = valForSort(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, q, periodo, sortKey, sortDir, soloBonifici]);

  const colSpan = 11 + (showArchivedColumns ? 2 : 0) - (nascondiRichiedente ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="h-10 w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Ultima settimana</SelectItem>
            <SelectItem value="30">Ultimo mese</SelectItem>
            <SelectItem value="90">Ultimi 3 mesi</SelectItem>
            <SelectItem value="tutto">Tutto</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={soloBonifici ? "default" : "outline"}
          className="h-10"
          aria-pressed={soloBonifici}
          onClick={() => setCampo("soloBonifici", !soloBonifici)}
        >
          Bonifici da eseguire
          {isTesoreria && (
            <Badge variant="secondary" className="ml-2 tabular-nums">{nBonifici}</Badge>
          )}
        </Button>
        <div className="ml-auto relative w-full sm:w-auto">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca titolo, descrizione o richiedente…"
            className="pl-8 w-full sm:w-72"
          />
        </div>
      </div>

      {/* Sotto md: schede */}
      <ElencoSchede>
        {isLoading && <div className="text-center text-muted-foreground py-8 text-sm">Caricamento…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">{emptyLabel}</div>
        )}
        {!isLoading && filtered.map((r) => {
          const nAll = r.richieste_interne_allegati?.length ?? 0;
          const showAdmin =
            showAdminBadge &&
            (r.status === "resp_approved" || r.status === "approved") &&
            r.admin_status &&
            r.admin_status !== "da_gestire";
          const campi: CampoScheda[] = [
            ...(nascondiRichiedente ? [] : [{ etichetta: "Richiedente", valore: r.requester_name }]),
            { etichetta: "Sede", valore: r.sede_name || "—" },
            { etichetta: "Importo", valore: <span className="font-mono">{fmtEuro(r.amount)}</span> },
            { etichetta: "Data", valore: fmtData(r.created_at) },
          ];
          if (showArchivedColumns) {
            campi.push({ etichetta: "Archiviata da", valore: r.archived_by_name || "—" });
            campi.push({ etichetta: "Data archiv.", valore: fmtData(r.archived_at) });
          }
          return (
            <div key={r.id} className="space-y-1.5">
              <SchedaLista
                className={cn("border-l-4", stilePrincipale(r).bordo)}
                onClick={() => openDetail(r.id)}
                titolo={
                  <span className={`inline-flex items-start gap-1.5 ${unreadIds?.has(r.id) ? "font-bold text-primary" : ""}`}>
                    {unreadIds?.has(r.id) && <MessageSquare className="size-3.5 text-primary shrink-0 mt-0.5" aria-label="Messaggi non letti" />}
                    <span>{r.title}</span>
                  </span>
                }
                badge={
                  nAll > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Paperclip className="size-3" />{nAll}
                    </span>
                  ) : undefined
                }
                campi={campi}
                footer={
                  <>
                    <BadgeStile stile={stileTipo(r.type)} />
                    <BadgeStile stile={stileStatus(r.status)} />
                    {showAdmin && <BadgeStile stile={stileAdmin(r.admin_status)} />}
                    <BadgeAcconto r={r} />
                  </>
                }
              />
              {(onGestisci || onRipristina) && (
                <div className="flex items-center gap-2">
                  {onGestisci && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => onGestisci(r)}>{gestisciLabel}</Button>
                  )}
                  {onRipristina && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => onRipristina(r)}>↩ Ripristina</Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </ElencoSchede>

      <div className="hidden md:block rounded-md border">

        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-1 p-0" aria-hidden />
              <SortHead active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")}>Richiesta</SortHead>
              {!nascondiRichiedente && <SortHead active={sortKey === "requester"} dir={sortDir} onClick={() => toggleSort("requester")}>Richiedente</SortHead>}
              <SortHead active={sortKey === "sede"} dir={sortDir} onClick={() => toggleSort("sede")}>Sede</SortHead>
              <SortHead active={sortKey === "type"} dir={sortDir} onClick={() => toggleSort("type")}>Tipo</SortHead>
              <SortHead active={sortKey === "fornitore"} dir={sortDir} onClick={() => toggleSort("fornitore")}>Fornitore</SortHead>
              <SortHead active={sortKey === "amount"} dir={sortDir} onClick={() => toggleSort("amount")} className="text-right">Importo</SortHead>
              <SortHead active={sortKey === "allegati"} dir={sortDir} onClick={() => toggleSort("allegati")}>All.</SortHead>
              <SortHead active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")}>Stato</SortHead>
              <SortHead active={sortKey === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")}>Data</SortHead>
              {showArchivedColumns && (
                <>
                  <TableHead>Archiviata da</TableHead>
                  <SortHead active={sortKey === "archived_at"} dir={sortDir} onClick={() => toggleSort("archived_at")}>Data archiv.</SortHead>
                </>
              )}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">Caricamento…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">{emptyLabel}</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const nAll = r.richieste_interne_allegati?.length ?? 0;
              const showAdmin =
                showAdminBadge &&
                (r.status === "resp_approved" || r.status === "approved") &&
                r.admin_status &&
                r.admin_status !== "da_gestire";
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r.id)}>
                  <TableCell className={cn("w-1 p-0 border-l-4", stilePrincipale(r).bordo)} aria-hidden />
                  <TableCell>
                    <div className={`flex items-center gap-1.5 ${unreadIds?.has(r.id) ? "font-bold text-primary" : "font-semibold"}`}>
                      {unreadIds?.has(r.id) && <MessageSquare className="size-3.5 text-primary shrink-0" aria-label="Messaggi non letti" />}
                      <span>{r.title}</span>
                    </div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[380px]">
                        {r.description.slice(0, 60)}{r.description.length > 60 ? "…" : ""}
                      </div>
                    )}
                  </TableCell>
                  {!nascondiRichiedente && <TableCell>{r.requester_name}</TableCell>}
                  <TableCell>{r.sede_name || "—"}</TableCell>
                  <TableCell><BadgeStile stile={stileTipo(r.type)} /></TableCell>
                  <TableCell>{r.fornitore || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmtEuro(r.amount)}</TableCell>
                  <TableCell>{nAll > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3" />{nAll}</span> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <BadgeStile stile={stileStatus(r.status)} />
                      {showAdmin && <BadgeStile stile={stileAdmin(r.admin_status)} />}
                      <BadgeAcconto r={r} />
                    </div>
                  </TableCell>
                  <TableCell>{fmtData(r.created_at)}</TableCell>
                  {showArchivedColumns && (
                    <>
                      <TableCell>{r.archived_by_name || "—"}</TableCell>
                      <TableCell>{fmtData(r.archived_at)}</TableCell>
                    </>
                  )}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      {onGestisci && (
                        <Button size="sm" variant="outline" onClick={() => onGestisci(r)}>{gestisciLabel}</Button>
                      )}
                      {onRipristina && (
                        <Button size="sm" variant="outline" onClick={() => onRipristina(r)}>↩ Ripristina</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>Apri</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function valForSort(r: RichiestaRow, k: SortKey): string | number | null {
  switch (k) {
    case "title": return r.title?.toLowerCase() ?? "";
    case "requester": return r.requester_name?.toLowerCase() ?? "";
    case "sede": return (r.sede_name ?? "").toLowerCase();
    case "type": return r.type ?? "";
    case "fornitore": return (r.fornitore ?? "").toLowerCase();
    case "amount": return r.amount ?? null;
    case "allegati": return r.richieste_interne_allegati?.length ?? 0;
    case "status": return r.status ?? "";
    case "created_at": return r.created_at ?? "";
    case "archived_at": return r.archived_at ?? "";
  }
}

function SortHead({
  active, dir, onClick, children, className,
}: { active: boolean; dir: "asc" | "desc"; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={className}>
      <button onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children}
        {active ? (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  );
}
