import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

type Anomalia = {
  id: string;
  importazione_id: string | null;
  cliente_id: string | null;
  codice_gestionale: string;
  ragione_sociale: string | null;
  tipo_anomalia: "perde_assicurazione" | "perde_gestione_legale" | "cambio_blocco";
  campo: string;
  valore_attuale: string | null;
  valore_nuovo: string | null;
  stato: "in_attesa" | "autorizzata" | "rifiutata";
  created_at: string;
  clienti?: { ragione_sociale: string | null; store_id: string | null } | null;
};

type TipoLabel = { label: string; cls: string };
const TIPO_LABEL: Partial<Record<Anomalia["tipo_anomalia"], TipoLabel>> = {
  perde_assicurazione: {
    label: "Perde assicurazione",
    cls: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  },
  perde_gestione_legale: {
    label: "Perde gestione legale",
    cls: "bg-red-500/15 text-red-700 border-red-500/30",
  },
};

async function getCountInAttesa(): Promise<number> {
  const { count } = await supabase
    .from("anomalie_import" as never)
    .select("id", { count: "exact", head: true })
    .eq("stato", "in_attesa");
  return count ?? 0;
}

export function useAnomalieCount() {
  return useQuery({
    queryKey: ["anomalie-import", "count"],
    queryFn: getCountInAttesa,
    refetchInterval: 15000,
  });
}

export function AnomalieImportCard() {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<string>("all");
  const [importazioneId, setImportazioneId] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const importsQ = useQuery({
    queryKey: ["anomalie-import", "imports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("importazioni")
        .select("id, nome_file, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const listQ = useQuery({
    queryKey: ["anomalie-import", "list", tipo, importazioneId],
    queryFn: async () => {
      let q = supabase
        .from("anomalie_import" as never)
        .select("*, clienti(ragione_sociale, store_id)")
        .eq("stato", "in_attesa")
        .order("created_at", { ascending: false })
        .limit(500);
      if (tipo !== "all") q = q.eq("tipo_anomalia", tipo);
      if (importazioneId !== "all") q = q.eq("importazione_id", importazioneId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Anomalia[]) ?? [];
    },
  });

  const rows = listQ.data ?? [];

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const applicaAnomalia = async (a: Anomalia, autorizza: boolean) => {
    const userRes = await supabase.auth.getUser();
    const uid = userRes.data.user?.id ?? null;

    if (autorizza && a.cliente_id) {
      if (a.tipo_anomalia === "perde_assicurazione") {
        await supabase
          .from("clienti")
          .update({ assicurazione_attiva: false })
          .eq("id", a.cliente_id);
        await supabase
          .from("assicurazioni_credito")
          .delete()
          .eq("cliente_id", a.cliente_id)
          .eq("assicuratore", "POUEY");
      } else if (a.tipo_anomalia === "perde_gestione_legale") {
        await supabase
          .from("clienti")
          .update({ in_gestione_legale: false })
          .eq("id", a.cliente_id);
        await supabase
          .from("note_legali_gestionali" as never)
          .delete()
          .eq("cliente_id", a.cliente_id);
      } else if (a.tipo_anomalia === "cambio_blocco") {
        const nuovo = parseInt(a.valore_nuovo ?? "0", 10);
        const patch: Record<string, unknown> = { ind_blocco: nuovo };
        if (nuovo === 0) {
          patch.bloccato = false;
          patch.motivo_blocco = null;
          patch.data_blocco = null;
        } else if (nuovo === 1) {
          patch.bloccato = true;
          patch.motivo_blocco = "Bloccato con possibilità di sblocco";
          patch.data_blocco = new Date().toISOString();
        } else if (nuovo === 2) {
          patch.bloccato = true;
          patch.motivo_blocco = "Bloccato";
          patch.data_blocco = new Date().toISOString();
        }
        await supabase.from("clienti").update(patch as never).eq("id", a.cliente_id);
      }
    }

    const { error } = await supabase
      .from("anomalie_import" as never)
      .update({
        stato: autorizza ? "autorizzata" : "rifiutata",
        gestita_da: uid,
        gestita_at: new Date().toISOString(),
      } as never)
      .eq("id", a.id);
    if (error) throw error;
  };

  const bulk = useMutation({
    mutationFn: async (autorizza: boolean) => {
      const target = rows.filter((r) => selected.has(r.id));
      for (const a of target) {
        await applicaAnomalia(a, autorizza);
      }
    },
    onSuccess: (_data, autorizza) => {
      toast.success(autorizza ? "Anomalie autorizzate" : "Anomalie rifiutate");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["anomalie-import"] });
    },
    onError: (e: unknown) =>
      toast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`),
  });

  const single = useMutation({
    mutationFn: async (args: { a: Anomalia; autorizza: boolean }) =>
      applicaAnomalia(args.a, args.autorizza),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["anomalie-import"] });
    },
    onError: (e: unknown) =>
      toast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`),
  });

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const selectedCount = useMemo(
    () => rows.filter((r) => selected.has(r.id)).length,
    [rows, selected],
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        <h2 className="font-semibold">Anomalie import in attesa</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tipo anomalia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="perde_assicurazione">Perde assicurazione</SelectItem>
            <SelectItem value="perde_gestione_legale">Perde gestione legale</SelectItem>
          </SelectContent>
        </Select>

        <Select value={importazioneId} onValueChange={setImportazioneId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Import" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli import</SelectItem>
            {(importsQ.data ?? []).map((imp) => (
              <SelectItem key={imp.id} value={imp.id}>
                {imp.nome_file} — {fmtDate(imp.created_at)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tipo !== "all" && rows.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
          >
            Seleziona tutti ({rows.length})
          </Button>
        )}

        {tipo !== "all" && rows.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              setSelected(new Set(rows.map((r) => r.id)));
              setTimeout(() => bulk.mutate(true), 50);
            }}
            disabled={bulk.isPending}
          >
            <Check className="h-4 w-4 mr-1" />
            Approva tutti{" "}
            {tipo === "perde_assicurazione"
              ? "perde assicurazione"
              : tipo === "perde_gestione_legale"
                ? "perde gestione legale"
                : ""}{" "}
            ({rows.length})
          </Button>
        )}
      </div>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna anomalia in attesa.</p>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Valore attuale</TableHead>
                  <TableHead>Nuovo valore</TableHead>
                  <TableHead>Data import</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const t = TIPO_LABEL[a.tipo_anomalia] ?? { label: a.tipo_anomalia, cls: "bg-gray-500/15 text-gray-700" };
                  const checked = selected.has(a.id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(a.id);
                            else next.delete(a.id);
                            setSelected(next);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {a.ragione_sociale ?? a.clienti?.ragione_sociale ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.codice_gestionale}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={t.cls}>
                          {t.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{a.campo}</TableCell>
                      <TableCell className="text-sm">{a.valore_attuale ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.valore_nuovo ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(a.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => single.mutate({ a, autorizza: true })}
                            disabled={single.isPending}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => single.mutate({ a, autorizza: false })}
                            disabled={single.isPending}
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {selectedCount > 0 && (
            <div className="mt-4 flex items-center justify-between p-3 border rounded-md bg-muted/30">
              <span className="text-sm font-medium">
                {selectedCount} selezionat{selectedCount === 1 ? "a" : "e"}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulk.mutate(false)}
                  disabled={bulk.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Rifiuta selezionate
                </Button>
                <Button
                  size="sm"
                  onClick={() => bulk.mutate(true)}
                  disabled={bulk.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Autorizza selezionate
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
