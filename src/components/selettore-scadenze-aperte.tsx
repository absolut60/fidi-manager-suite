// Selettore condiviso di scadenze aperte di un cliente.
// Fonte unica per il piano di rientro e (in futuro) la promessa di pagamento.
// Definizione canonica di "scadenza aperta": data_pagamento_effettiva IS NULL
// e importo_scadenza > 0.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtEuro, fmtDate } from "@/lib/piani-rientro";

export type ScadenzaAperta = {
  id: string;
  numero_documento: string | null;
  data_scadenza: string | null;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
};

type Props = {
  clienteId: string;
  open: boolean;
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  mostraBadgePiani?: boolean;
  titolo?: string;
  /** Notifica al parent le scadenze caricate + il totale delle selezionate. */
  onStateChange?: (info: { scadenze: ScadenzaAperta[]; totaleSelezionato: number }) => void;
};

export function SelettoreScadenzeAperte({
  clienteId,
  open,
  selectedIds,
  onChange,
  mostraBadgePiani = true,
  titolo = "Documenti (scadenze aperte)",
  onStateChange,
}: Props) {
  const { data: scadenze, isLoading } = useQuery({
    queryKey: ["selettore-scadenze-aperte", clienteId],
    enabled: open && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_scadenza, importo_scadenza, giorni_ritardo, stato_contabile, data_pagamento_effettiva")
        .eq("cliente_id", clienteId)
        .is("data_pagamento_effettiva", null)
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).filter((s) => (s.importo_scadenza ?? 0) > 0) as ScadenzaAperta[];
    },
  });

  const { data: scadenzeInAltriPiani = new Map<string, { piano_id: string; created_at: string; stato: string }[]>() } = useQuery({
    queryKey: ["selettore-scadenze-altri-piani", clienteId],
    enabled: open && !!clienteId && mostraBadgePiani,
    queryFn: async () => {
      const { data: piani, error: eP } = await supabase
        .from("piani_rientro" as never)
        .select("id, created_at, stato")
        .eq("cliente_id", clienteId);
      if (eP) throw eP;
      const pRows = (piani ?? []) as unknown as Array<{ id: string; created_at: string; stato: string }>;
      if (pRows.length === 0) return new Map();
      const { data: docs, error: eD } = await supabase
        .from("piani_rientro_documenti" as never)
        .select("piano_id, scadenza_id")
        .in("piano_id", pRows.map((p) => p.id));
      if (eD) throw eD;
      const pById = new Map(pRows.map((p) => [p.id, { piano_id: p.id, created_at: p.created_at, stato: p.stato }]));
      const map = new Map<string, { piano_id: string; created_at: string; stato: string }[]>();
      for (const d of (docs ?? []) as never as Array<{ piano_id: string; scadenza_id: string }>) {
        const p = pById.get(d.piano_id);
        if (!p) continue;
        if (!map.has(d.scadenza_id)) map.set(d.scadenza_id, []);
        map.get(d.scadenza_id)!.push(p);
      }
      return map;
    },
  });

  const totaleSelezionato = useMemo(() => {
    return (scadenze ?? []).reduce(
      (acc, s) => acc + (selectedIds.has(s.id) ? Number(s.importo_scadenza ?? 0) : 0),
      0,
    );
  }, [scadenze, selectedIds]);

  useEffect(() => {
    onStateChange?.({ scadenze: scadenze ?? [], totaleSelezionato });
  }, [scadenze, totaleSelezionato, onStateChange]);

  function toggleScadenza(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }
  function toggleAll(v: boolean) {
    if (!v) { onChange(new Set()); return; }
    onChange(new Set((scadenze ?? []).map((s) => s.id)));
  }

  const rows = scadenze ?? [];
  const allSelected = rows.length > 0 && rows.every((s) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-semibold">{titolo}</Label>
        <div className="text-sm">
          Totale selezionato: <strong className="tabular-nums">{fmtEuro(totaleSelezionato)}</strong>
          {" · "}<span className="text-muted-foreground">{selectedIds.size} righe</span>
        </div>
      </div>
      <div className="border rounded-md max-h-72 overflow-y-auto">
        {isLoading ? <Skeleton className="h-24 m-2" /> : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground italic">Nessuna scadenza aperta per questo cliente.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Data scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">gg ritardo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const sel = selectedIds.has(s.id);
                const altriPiani = mostraBadgePiani ? (scadenzeInAltriPiani.get(s.id) ?? []) : [];
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => toggleScadenza(s.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={sel} onCheckedChange={() => toggleScadenza(s.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{s.numero_documento ?? "—"}</span>
                        {altriPiani.length > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px] font-normal"
                            title={altriPiani
                              .map((p: { piano_id: string; created_at: string; stato: string }) => `Piano del ${fmtDate(p.created_at)} — ${p.stato}`)
                              .join("\n")}
                          >
                            già in {altriPiani.length === 1 ? "un piano" : `${altriPiani.length} piani`} del {fmtDate(altriPiani[0].created_at)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                    <TableCell className="text-right">
                      {(s.giorni_ritardo ?? 0) > 0 ? (
                        <Badge className="bg-orange-500 text-white hover:bg-orange-500">{s.giorni_ritardo} gg</Badge>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
