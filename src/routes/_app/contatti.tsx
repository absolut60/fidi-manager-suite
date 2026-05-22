import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Star, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/contatti")({
  component: ContattiPage,
});

function CB({ ok }: { ok: boolean }) {
  return ok
    ? <Badge className="bg-success/15 text-success border-success/30"><Check className="size-3" /></Badge>
    : <Badge variant="outline" className="text-muted-foreground"><X className="size-3" /></Badge>;
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

function ContattiPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [clienteId, setClienteId] = useState("all");
  const [statoConsenso, setStatoConsenso] = useState("tutti");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientiOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((c: any) => {
      if (c.clienti) m.set(c.clienti.id, c.clienti.ragione_sociale);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((c: any) => {
      if (storeId !== "all" && c.clienti?.store_id !== storeId) return false;
      if (clienteId !== "all" && c.clienti?.id !== clienteId) return false;
      const n = (c.consenso_profilazione ? 1 : 0)
        + (c.consenso_marketing_media ? 1 : 0)
        + (c.consenso_marketing_diretto ? 1 : 0);
      if (statoConsenso === "almeno_uno" && n === 0) return false;
      if (statoConsenso === "nessuno" && n > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.clienti?.ragione_sociale ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, storeId, clienteId, statoConsenso]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="size-7 text-primary" /> Contatti
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Referenti collegati ai clienti con stato consensi privacy
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca nome, email o cliente..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-56">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clientiOptions.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
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
          <div className="w-56">
            <Select value={statoConsenso} onValueChange={setStatoConsenso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i consensi</SelectItem>
                <SelectItem value="almeno_uno">Almeno uno firmato</SelectItem>
                <SelectItem value="nessuno">Nessuno firmato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nessun contatto trovato</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cellulare</TableHead>
                <TableHead className="text-center">Profilaz.</TableHead>
                <TableHead className="text-center">Marketing</TableHead>
                <TableHead className="text-center">WhatsApp</TableHead>
                <TableHead>Data firma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: c.clienti.id },
                    search: { tab: "contatti" },
                  })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.principale && <Star className="size-3 fill-accent text-accent" />}
                      {c.nome} {c.cognome}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.clienti?.ragione_sociale}
                    <div className="text-xs text-muted-foreground">{c.clienti?.stores?.nome ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ruolo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cellulare ?? "—"}</TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_profilazione} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_media} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_diretto} /></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.data_firma)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
