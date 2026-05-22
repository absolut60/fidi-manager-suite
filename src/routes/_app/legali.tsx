import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Search } from "lucide-react";
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

export const Route = createFileRoute("/_app/legali")({
  component: PraticheLegaliPage,
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

const STATI_CHIUSI = new Set(["chiusa_pagamento", "chiusa_perdita"]);

function statoTone(stato: string): { label: string; cls: string } {
  if (stato === "aperta") return { label: "Aperta", cls: "bg-destructive text-destructive-foreground" };
  if (STATI_CHIUSI.has(stato)) return { label: stato.replace(/_/g, " "), cls: "bg-success text-success-foreground" };
  if (stato === "sospesa") return { label: "Sospesa", cls: "bg-muted text-muted-foreground" };
  return { label: stato.replace(/_/g, " "), cls: "bg-orange-500 text-white" };
}

export default function PraticheLegaliPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";

  const [stato, setStato] = useState<string>("tutti");
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
    queryKey: ["pratiche-legali-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche_legali")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("data_apertura", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return (data ?? []).filter((r: any) => {
      if (storeId !== "all" && r.clienti?.store_id !== storeId) return false;
      if (stato === "aperte" && (r.stato !== "aperta" && !["in_corso", "decreto_ottenuto", "pignoramento_eseguito"].includes(r.stato))) return false;
      if (stato === "chiuse" && !STATI_CHIUSI.has(r.stato)) return false;
      if (stato !== "tutti" && stato !== "aperte" && stato !== "chiuse" && r.stato !== stato) return false;
      if (q) {
        const ql = q.toLowerCase();
        if (!String(r.clienti?.ragione_sociale ?? "").toLowerCase().includes(ql) &&
            !String(r.studio_legale ?? "").toLowerCase().includes(ql) &&
            !String(r.numero_fascicolo ?? "").toLowerCase().includes(ql)) return false;
      }
      return true;
    });
  }, [data, stato, storeId, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Gavel className="size-7 text-primary" /> Pratiche Legali
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tutte le pratiche legali {isStoreManager ? "del tuo store" : "aperte sui clienti"}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente, studio, fascicolo..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-48">
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                <SelectItem value="aperte">Aperte / In corso</SelectItem>
                <SelectItem value="aperta">Aperta</SelectItem>
                <SelectItem value="in_corso">In corso</SelectItem>
                <SelectItem value="decreto_ottenuto">Decreto ottenuto</SelectItem>
                <SelectItem value="pignoramento_eseguito">Pignoramento eseguito</SelectItem>
                <SelectItem value="chiuse">Chiuse</SelectItem>
                <SelectItem value="sospesa">Sospesa</SelectItem>
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
          <div className="p-12 text-center text-sm text-muted-foreground">Nessuna pratica trovata</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Importo contestato</TableHead>
                <TableHead>Apertura</TableHead>
                <TableHead>Avvocato / Studio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const tone = statoTone(r.stato);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate({
                      to: "/clienti/$clienteId",
                      params: { clienteId: r.clienti.id },
                      search: { tab: "insoluti", insolutiTab: "legali" },
                    })}
                  >
                    <TableCell className="font-medium">
                      {r.clienti?.ragione_sociale}
                      <div className="text-xs text-muted-foreground">{r.clienti?.stores?.nome ?? "—"}</div>
                    </TableCell>
                    <TableCell className="capitalize">{String(r.tipo).replace(/_/g, " ")}</TableCell>
                    <TableCell><Badge className={tone.cls}>{tone.label}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(r.importo_contestato)}</TableCell>
                    <TableCell>{fmtDate(r.data_apertura)}</TableCell>
                    <TableCell>
                      {r.riferimento_avvocato ?? r.studio_legale ?? "—"}
                      {r.numero_fascicolo && <div className="text-xs text-muted-foreground">Fasc. {r.numero_fascicolo}</div>}
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
