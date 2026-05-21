import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type AuditRow = {
  id: string;
  user_email: string | null;
  entita: string;
  entita_id: string | null;
  azione: string;
  dettagli: Record<string, unknown> | null;
  created_at: string;
};

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { role, loading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filtroEntita, setFiltroEntita] = useState<string>("tutte");
  const [search, setSearch] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading || role !== "amministratore") return;
    (async () => {
      setLoadingData(true);
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as AuditRow[]) ?? []);
      setLoadingData(false);
    })();
  }, [role, loading]);

  if (loading) return null;
  if (role !== "amministratore") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accesso negato</CardTitle>
          <CardDescription>Solo gli amministratori possono consultare l'audit log.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const filtered = rows.filter((r) => {
    if (filtroEntita !== "tutte" && r.entita !== filtroEntita) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.user_email?.toLowerCase().includes(s) ||
        r.azione.toLowerCase().includes(s) ||
        JSON.stringify(r.dettagli ?? {}).toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Cronologia delle azioni sul sistema</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-3 flex-wrap">
            <Input
              placeholder="Cerca utente, azione, dettagli…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filtroEntita} onValueChange={setFiltroEntita}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le entità</SelectItem>
                <SelectItem value="richiesta_fido">Richieste fido</SelectItem>
                <SelectItem value="cliente">Clienti</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Utente</TableHead>
                <TableHead>Entità</TableHead>
                <TableHead>Azione</TableHead>
                <TableHead>Dettagli</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingData ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Caricamento…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessun evento</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(r.created_at), "dd/MM/yy HH:mm:ss", { locale: it })}
                  </TableCell>
                  <TableCell className="text-xs">{r.user_email ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.entita}</Badge></TableCell>
                  <TableCell><Badge>{r.azione}</Badge></TableCell>
                  <TableCell className="text-xs font-mono max-w-md truncate">
                    {r.dettagli ? JSON.stringify(r.dettagli) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
