import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/assicurazioni")({
  component: AssicurazioniPage,
});

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

type StatoFilter = "tutti" | "attiva" | "scaduta" | "sinistro";

export default function AssicurazioniPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";

  const [stato, setStato] = useState<StatoFilter>("tutti");
  const [storeId, setStoreId] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["assicurazioni-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assicurazioni_credito")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    return (data ?? []).filter((r: any) => {
      const cli = r.clienti;
      if (!cli) return false;
      if (storeId !== "all" && cli.store_id !== storeId) return false;
      if (q) {
        const ql = q.toLowerCase();
        if (!String(cli.ragione_sociale ?? "").toLowerCase().includes(ql) &&
            !String(r.assicuratore ?? "").toLowerCase().includes(ql) &&
            !String(r.numero_polizza ?? "").toLowerCase().includes(ql)) return false;
      }
      if (stato === "sinistro" && !r.sinistro_aperto) return false;
      if (stato === "attiva") {
        if (r.stato !== "attiva") return false;
        if (r.data_scadenza && r.data_scadenza < today) return false;
      }
      if (stato === "scaduta") {
        if (!r.data_scadenza || r.data_scadenza >= today) return false;
      }
      return true;
    });
  }, [data, stato, storeId, q, today]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="size-7 text-primary" /> Assicurazioni crediti
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tutte le polizze {isStoreManager ? "del tuo store" : "dei clienti"}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente, assicuratore, polizza..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-48">
            <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                <SelectItem value="attiva">Attiva</SelectItem>
                <SelectItem value="scaduta">Scaduta</SelectItem>
                <SelectItem value="sinistro">Sinistro aperto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isStoreManager && (
            <div className="w-56">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli store</SelectItem>
                  {stores?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nessuna polizza trovata</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Assicuratore</TableHead>
                <TableHead className="text-right">Massimale</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const scaduta = r.data_scadenza && r.data_scadenza < today;
                const sinistro = r.sinistro_aperto;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate({
                      to: "/clienti/$clienteId",
                      params: { clienteId: r.clienti.id },
                      search: { tab: "insoluti", insolutiTab: "assicurazioni" },
                    })}
                  >
                    <TableCell className="font-medium">
                      {r.clienti?.ragione_sociale}
                      <div className="text-xs text-muted-foreground">{r.clienti?.stores?.nome ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      {r.assicuratore}
                      {r.numero_polizza && <div className="text-xs text-muted-foreground">N. {r.numero_polizza}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(r.importo_massimale ?? r.importo_assicurato)}</TableCell>
                    <TableCell>{fmtDate(r.data_scadenza)}</TableCell>
                    <TableCell>
                      {sinistro ? (
                        <Badge className="bg-destructive text-destructive-foreground">Sinistro aperto</Badge>
                      ) : scaduta ? (
                        <Badge variant="outline" className="border-orange-500 text-orange-600">Scaduta</Badge>
                      ) : r.stato === "attiva" ? (
                        <Badge className="bg-success text-success-foreground">Attiva</Badge>
                      ) : (
                        <Badge variant="outline">{r.stato}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
