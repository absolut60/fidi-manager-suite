import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Search, FileText, Hammer, Users } from "lucide-react";
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
const STATI_APERTI = new Set(["aperta", "in_corso", "decreto_ottenuto", "pignoramento_eseguito"]);

function statoTone(stato: string): { label: string; cls: string } {
  if (stato === "aperta") return { label: "Aperta", cls: "bg-destructive text-destructive-foreground" };
  if (STATI_CHIUSI.has(stato)) return { label: stato.replace(/_/g, " "), cls: "bg-success text-success-foreground" };
  if (stato === "sospesa") return { label: "Sospesa", cls: "bg-muted text-muted-foreground" };
  return { label: stato.replace(/_/g, " "), cls: "bg-orange-500 text-white" };
}

function categoriaTone(cat?: string | null): string {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("pignoramento")) return "bg-destructive text-destructive-foreground";
  if (c.includes("decreto")) return "bg-orange-500 text-white";
  if (c.includes("pouey")) return "bg-purple-600 text-white";
  if (c.includes("fallimento") || c.includes("concordato")) return "bg-red-700 text-white";
  return "bg-muted text-muted-foreground";
}

type Row = {
  id: string;
  origine: "manuale" | "gestionale";
  cliente_id: string;
  ragione_sociale: string;
  store_id: string | null;
  store_nome: string | null;
  tipo: string;
  categoria: string | null;
  stato: string;
  importo: number | null;
  data_apertura: string | null;
  avvocato: string | null;
  numero_fascicolo: string | null;
  ultimo_aggiornamento: string | null;
};

function PraticheLegaliPage() {
  const navigate = useNavigate();
  const { role, profilo } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;

  const [stato, setStato] = useState<string>("tutti");
  const [storeId, setStoreId] = useState<string>(
    isStoreManager && myStoreId ? myStoreId : "all"
  );
  const [tipoFilter, setTipoFilter] = useState<string>("tutti");
  const [origine, setOrigine] = useState<string>("tutte");
  const [q, setQ] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: manuali, isLoading: loadingManuali } = useQuery({
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

  const { data: gestionali, isLoading: loadingGest } = useQuery({
    queryKey: ["note-legali-gestionali-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("note_legali_gestionali")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("ultima_sincronizzazione", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientiLegale } = useQuery({
    queryKey: ["clienti-in-gestione-legale-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clienti")
        .select("id", { count: "exact", head: true })
        .eq("in_gestione_legale", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const allRows: Row[] = useMemo(() => {
    const m: Row[] = (manuali ?? []).map((r: any) => ({
      id: `m_${r.id}`,
      origine: "manuale",
      cliente_id: r.clienti.id,
      ragione_sociale: r.clienti?.ragione_sociale ?? "—",
      store_id: r.clienti?.store_id ?? null,
      store_nome: r.clienti?.stores?.nome ?? null,
      tipo: String(r.tipo ?? ""),
      categoria: String(r.tipo ?? "").replace(/_/g, " "),
      stato: r.stato,
      importo: r.importo_contestato,
      data_apertura: r.data_apertura,
      avvocato: r.riferimento_avvocato ?? r.studio_legale ?? null,
      numero_fascicolo: r.numero_fascicolo,
      ultimo_aggiornamento: r.updated_at,
    }));
    const g: Row[] = (gestionali ?? []).map((r: any) => ({
      id: `g_${r.id}`,
      origine: "gestionale",
      cliente_id: r.clienti.id,
      ragione_sociale: r.clienti?.ragione_sociale ?? "—",
      store_id: r.clienti?.store_id ?? null,
      store_nome: r.clienti?.stores?.nome ?? null,
      tipo: "nota_gestionale",
      categoria: r.categoria,
      stato: "gestionale",
      importo: null,
      data_apertura: r.ultima_sincronizzazione,
      avvocato: null,
      numero_fascicolo: null,
      ultimo_aggiornamento: r.ultima_sincronizzazione,
    }));
    return [...m, ...g];
  }, [manuali, gestionali]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (origine === "manuali" && r.origine !== "manuale") return false;
      if (origine === "gestionali" && r.origine !== "gestionale") return false;
      if (storeId !== "all" && r.store_id !== storeId) return false;
      if (tipoFilter !== "tutti") {
        const c = (r.categoria ?? "").toLowerCase();
        if (tipoFilter === "decreto" && !c.includes("decreto")) return false;
        if (tipoFilter === "pignoramento" && !c.includes("pignoramento")) return false;
        if (tipoFilter === "pouey" && !c.includes("pouey")) return false;
        if (tipoFilter === "fallimento" && !(c.includes("fallimento") || c.includes("concordato"))) return false;
      }
      if (stato !== "tutti" && r.origine === "manuale") {
        if (stato === "aperte" && !STATI_APERTI.has(r.stato)) return false;
        if (stato === "chiuse" && !STATI_CHIUSI.has(r.stato)) return false;
        if (!["tutti", "aperte", "chiuse"].includes(stato) && r.stato !== stato) return false;
      } else if (stato !== "tutti" && r.origine === "gestionale") {
        return false;
      }
      if (q) {
        const ql = q.toLowerCase();
        if (!r.ragione_sociale.toLowerCase().includes(ql) &&
            !String(r.avvocato ?? "").toLowerCase().includes(ql) &&
            !String(r.numero_fascicolo ?? "").toLowerCase().includes(ql) &&
            !String(r.categoria ?? "").toLowerCase().includes(ql)) return false;
      }
      return true;
    });
  }, [allRows, stato, storeId, tipoFilter, origine, q]);

  const kpi = useMemo(() => {
    const aperte = (manuali ?? []).filter((r: any) => STATI_APERTI.has(r.stato)).length;
    const decreti = (manuali ?? []).filter((r: any) =>
      STATI_APERTI.has(r.stato) && (String(r.tipo).toLowerCase().includes("decreto"))
    ).length + (gestionali ?? []).filter((r: any) =>
      String(r.categoria ?? "").toLowerCase().includes("decreto")
    ).length;
    const pignoramenti = (manuali ?? []).filter((r: any) =>
      STATI_APERTI.has(r.stato) && String(r.tipo).toLowerCase().includes("pignoramento")
    ).length + (gestionali ?? []).filter((r: any) =>
      String(r.categoria ?? "").toLowerCase().includes("pignoramento")
    ).length;
    return { aperte, decreti, pignoramenti };
  }, [manuali, gestionali]);

  const isLoading = loadingManuali || loadingGest;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Gavel className="size-7 text-primary" /> Pratiche Legali
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pratiche manuali e note gestionali importate {isStoreManager ? "del tuo store" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10 text-destructive"><Gavel className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Pratiche aperte</div>
              <div className="text-2xl font-bold tabular-nums">{kpi.aperte}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-orange-500/10 text-orange-600"><FileText className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Decreti Ingiuntivi</div>
              <div className="text-2xl font-bold tabular-nums">{kpi.decreti}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-red-500/10 text-red-600"><Hammer className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Pignoramenti attivi</div>
              <div className="text-2xl font-bold tabular-nums">{kpi.pignoramenti}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-purple-500/10 text-purple-600"><Users className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Clienti in gestione</div>
              <div className="text-2xl font-bold tabular-nums">{clientiLegale ?? 0}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente, studio, fascicolo, categoria..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-44">
            <Select value={origine} onValueChange={setOrigine}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le origini</SelectItem>
                <SelectItem value="manuali">Solo manuali</SelectItem>
                <SelectItem value="gestionali">Solo gestionali</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger><SelectValue placeholder="Tipo pratica" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i tipi</SelectItem>
                <SelectItem value="decreto">Decreto Ingiuntivo</SelectItem>
                <SelectItem value="pignoramento">Pignoramento</SelectItem>
                <SelectItem value="pouey">POUEY</SelectItem>
                <SelectItem value="fallimento">Fallimento/Concordato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
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
                <TableHead>Store</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Categoria / Tipo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Apertura</TableHead>
                <TableHead>Avvocato</TableHead>
                <TableHead>Ultimo agg.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tone = r.origine === "gestionale"
                  ? { label: "Gestionale", cls: "bg-blue-600 text-white" }
                  : statoTone(r.stato);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate({
                      to: "/clienti/$clienteId",
                      params: { clienteId: r.cliente_id },
                      search: { tab: "insoluti", insolutiTab: "legali" },
                    })}
                  >
                    <TableCell className="font-medium">{r.ragione_sociale}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.store_nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.origine === "gestionale" ? "secondary" : "outline"} className="capitalize">
                        {r.origine}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.categoria ? (
                        <Badge className={categoriaTone(r.categoria)}>{r.categoria}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Badge className={tone.cls}>{tone.label}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(r.importo)}</TableCell>
                    <TableCell>{fmtDate(r.data_apertura)}</TableCell>
                    <TableCell>
                      {r.avvocato ?? "—"}
                      {r.numero_fascicolo && <div className="text-xs text-muted-foreground">Fasc. {r.numero_fascicolo}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.ultimo_aggiornamento)}</TableCell>
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
