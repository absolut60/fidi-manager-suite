import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Paperclip, Search } from "lucide-react";
import { NuovaRichiestaDialog } from "@/components/richieste-interne/nuova-richiesta-dialog";

export const Route = createFileRoute("/_app/richieste-interne/mie")({
  component: MieRichieste,
});

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Approvazione preventivo",
  attivita: "Richiesta attività",
  acquisto: "Acquisto materiali/servizi",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ Att. Resp. Gen.",
  resp_approved: "✓ Approvata (Liv.1)",
  forwarded: "→ Att. Direzione",
  approved: "✓ Approvata",
  rejected: "✕ Rifiutata",
};

const ADMIN_LABEL: Record<string, string> = {
  da_gestire: "🔴 Da gestire",
  in_gestione: "🟡 In gestione",
  conclusa: "🟢 Conclusa",
};

type FiltroStato = "tutte" | "attesa" | "approvate" | "rifiutate";
type SortKey = "title" | "type" | "fornitore" | "amount" | "allegati" | "status" | "updated_at";

const fmtEuro = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtData = (v: string) => new Date(v).toLocaleDateString("it-IT");

function MieRichieste() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const navigate = useNavigate();
  const openDetail = (id: string) => navigate({ to: "/richieste-interne/$richiestaId", params: { richiestaId: id } });
  const [filtro, setFiltro] = useState<FiltroStato>("tutte");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "mie", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select("id,title,description,type,fornitore,amount,status,admin_status,updated_at,richieste_interne_allegati(id)")
        .eq("requester_id", uid)
        .eq("archived", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const rows = (data ?? []).filter((r) => {
      if (filtro === "attesa" && !(r.status === "pending" || r.status === "forwarded")) return false;
      if (filtro === "approvate" && !(r.status === "resp_approved" || r.status === "approved")) return false;
      if (filtro === "rifiutate" && r.status !== "rejected") return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        if (!(r.title?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = valForSort(a, sortKey);
      const vb = valForSort(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [data, filtro, q, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const conteggi = useMemo(() => {
    const rows = data ?? [];
    return {
      tutte: rows.length,
      attesa: rows.filter((r) => r.status === "pending" || r.status === "forwarded").length,
      approvate: rows.filter((r) => r.status === "resp_approved" || r.status === "approved").length,
      rifiutate: rows.filter((r) => r.status === "rejected").length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Le mie richieste</h1>
        <p className="text-sm text-muted-foreground">Richieste che hai creato</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PillFilter active={filtro === "tutte"} onClick={() => setFiltro("tutte")}>Tutte ({conteggi.tutte})</PillFilter>
        <PillFilter active={filtro === "attesa"} onClick={() => setFiltro("attesa")}>In attesa ({conteggi.attesa})</PillFilter>
        <PillFilter active={filtro === "approvate"} onClick={() => setFiltro("approvate")}>Approvate ({conteggi.approvate})</PillFilter>
        <PillFilter active={filtro === "rifiutate"} onClick={() => setFiltro("rifiutate")}>Rifiutate ({conteggi.rifiutate})</PillFilter>
        <div className="ml-auto relative">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca titolo o descrizione…" className="pl-8 w-64" />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")}>Richiesta</SortHead>
              <SortHead active={sortKey === "type"} dir={sortDir} onClick={() => toggleSort("type")}>Tipo</SortHead>
              <SortHead active={sortKey === "fornitore"} dir={sortDir} onClick={() => toggleSort("fornitore")}>Fornitore</SortHead>
              <SortHead active={sortKey === "amount"} dir={sortDir} onClick={() => toggleSort("amount")} className="text-right">Importo</SortHead>
              <SortHead active={sortKey === "allegati"} dir={sortDir} onClick={() => toggleSort("allegati")}>Allegati</SortHead>
              <SortHead active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")}>Stato</SortHead>
              <SortHead active={sortKey === "updated_at"} dir={sortDir} onClick={() => toggleSort("updated_at")}>Aggiornata</SortHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Caricamento…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nessuna richiesta</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const nAll = r.richieste_interne_allegati?.length ?? 0;
              const showAdmin = (r.status === "resp_approved" || r.status === "approved") && r.admin_status && r.admin_status !== "da_gestire";
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r.id)}>
                  <TableCell>
                    <div className="font-semibold">{r.title}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[420px]">
                        {r.description.slice(0, 60)}{r.description.length > 60 ? "…" : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{TIPO_LABEL[r.type] ?? r.type}</Badge></TableCell>
                  <TableCell>{r.fornitore || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmtEuro(r.amount)}</TableCell>
                  <TableCell>{nAll > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3" />{nAll}</span> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      {showAdmin && <Badge variant="outline" className="w-fit">{ADMIN_LABEL[r.admin_status!] ?? r.admin_status}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{fmtData(r.updated_at)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(r.id); }}>Apri</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function valForSort(r: any, k: SortKey): string | number | null {
  switch (k) {
    case "title": return r.title?.toLowerCase() ?? "";
    case "type": return r.type ?? "";
    case "fornitore": return (r.fornitore ?? "").toLowerCase();
    case "amount": return r.amount ?? null;
    case "allegati": return r.richieste_interne_allegati?.length ?? 0;
    case "status": return r.status ?? "";
    case "updated_at": return r.updated_at ?? "";
  }
}

function PillFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function SortHead({ active, dir, onClick, children, className }: { active: boolean; dir: "asc" | "desc"; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={className}>
      <button onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children}
        {active ? (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  );
}
