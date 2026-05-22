import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Search, Download, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/privacy")({
  component: PrivacyPage,
});

function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

export default function PrivacyPage() {
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
    queryKey: ["privacy-contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, nome, cognome, ruolo, privacy_firmata, data_firma, pdf_privacy_url, pdf_privacy_path, cliente_id, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("data_firma", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return (data ?? []).filter((r: any) => {
      if (storeId !== "all" && r.clienti?.store_id !== storeId) return false;
      if (stato === "firmata" && !r.privacy_firmata) return false;
      if (stato === "non_firmata" && r.privacy_firmata) return false;
      if (q) {
        const ql = q.toLowerCase();
        const fullName = `${r.nome ?? ""} ${r.cognome ?? ""}`.toLowerCase();
        if (!String(r.clienti?.ragione_sociale ?? "").toLowerCase().includes(ql) &&
            !fullName.includes(ql)) return false;
      }
      return true;
    });
  }, [data, stato, storeId, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileSignature className="size-7 text-primary" /> Privacy contatti
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stato firme privacy di tutti i contatti {isStoreManager ? "del tuo store" : ""}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente o contatto..."
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
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="firmata">Firmata</SelectItem>
                <SelectItem value="non_firmata">Non firmata</SelectItem>
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
          <div className="p-12 text-center text-sm text-muted-foreground">Nessun contatto trovato</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contatto</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="text-center">Privacy base</TableHead>
                <TableHead className="text-center">Marketing</TableHead>
                <TableHead>Data firma</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: r.clienti.id },
                    search: { tab: "privacy" },
                  })}
                >
                  <TableCell className="font-medium">
                    {r.clienti?.ragione_sociale}
                    <div className="text-xs text-muted-foreground">{r.clienti?.stores?.nome ?? "—"}</div>
                  </TableCell>
                  <TableCell>{`${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.ruolo ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {r.privacy_firmata ? (
                      <Badge className="bg-success text-success-foreground"><Check className="size-3" /> Firmata</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground"><X className="size-3" /> No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground text-xs">—</TableCell>
                  <TableCell>{fmtDate(r.data_firma)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.pdf_privacy_path || r.pdf_privacy_url ? (
                      <PdfPrivacyButton path={r.pdf_privacy_path} url={r.pdf_privacy_url} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
