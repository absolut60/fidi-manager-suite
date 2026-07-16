import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, MessageSquare, Paperclip, Search } from "lucide-react";

export const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ Att. Resp. Gen.",
  resp_approved: "✓ Approvata (Liv.1)",
  forwarded: "→ Att. Direzione",
  approved: "✓ Approvata",
  rejected: "✕ Rifiutata",
};

export const ADMIN_LABEL: Record<string, string> = {
  da_gestire: "🔴 Da gestire",
  in_gestione: "🟡 In gestione",
  conclusa: "🟢 Conclusa",
};

export const TIPO_LABEL: Record<string, string> = {
  preventivo: "Approvazione preventivo",
  attivita: "Richiesta attività",
  acquisto: "Acquisto materiali/servizi",
};

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
};

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

type Periodo = "tutto" | "30" | "90";

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
}: {
  rows: RichiestaRow[] | undefined;
  isLoading: boolean;
  showAdminBadge?: boolean;
  showArchivedColumns?: boolean;
  defaultSortKey?: SortKey;
  emptyLabel?: string;
  unreadIds?: Set<string>;
}) {
  const navigate = useNavigate();
  const openDetail = (id: string) => navigate({ to: "/richieste-interne/$richiestaId", params: { richiestaId: id } });
  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tutto");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
  }, [rows, q, periodo, sortKey, sortDir]);

  const colSpan = 10 + (showArchivedColumns ? 2 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutto">Tutto</SelectItem>
            <SelectItem value="30">Ultimi 30 giorni</SelectItem>
            <SelectItem value="90">Ultimi 90 giorni</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto relative">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca titolo, descrizione o richiedente…"
            className="pl-8 w-72"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")}>Richiesta</SortHead>
              <SortHead active={sortKey === "requester"} dir={sortDir} onClick={() => toggleSort("requester")}>Richiedente</SortHead>
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
                  <TableCell>{r.requester_name}</TableCell>
                  <TableCell>{r.sede_name || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{TIPO_LABEL[r.type] ?? r.type}</Badge></TableCell>
                  <TableCell>{r.fornitore || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmtEuro(r.amount)}</TableCell>
                  <TableCell>{nAll > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3" />{nAll}</span> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      {showAdmin && <Badge variant="outline" className="w-fit">{ADMIN_LABEL[r.admin_status!] ?? r.admin_status}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{fmtData(r.created_at)}</TableCell>
                  {showArchivedColumns && (
                    <>
                      <TableCell>{r.archived_by_name || "—"}</TableCell>
                      <TableCell>{fmtData(r.archived_at)}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(r.id); }}>Apri</Button>
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
