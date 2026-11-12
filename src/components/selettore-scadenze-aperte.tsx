// Selettore condiviso di scadenze aperte di un cliente.
// Fonte unica per il piano di rientro e (in futuro) la promessa di pagamento.
//
// Definizione canonica di "scadenza selezionabile" (collegabile a promesse di
// pagamento e piani di rientro): una riga lo è se
//   importo_scadenza > 0
//   E NON è una rata chiusa in anticipo da Gamma (scadenzaChiusaAnticipata)
//   E vale ALMENO UNA delle due:
//     a) data_pagamento_effettiva IS NULL            (nessun pagamento registrato)
//     b) stato_contabile = 'Aperta'                  (pagamento parziale: Gamma
//                                                     valorizza la data di pagamento
//                                                     anche sugli acconti, ma il
//                                                     residuo è ancora dovuto)
// L'importo mostrato e sommato resta importo_scadenza (per le righe del caso b)
// è già il residuo). La regola vive SOLO in scadenzaSelezionabile qui sotto, che
// è la stessa usata dal filtro della query.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtEuro, fmtDate } from "@/lib/piani-rientro";
import { scadenzaChiusaAnticipata } from "@/lib/scadenze";

export type ScadenzaAperta = {
  id: string;
  numero_documento: string | null;
  data_scadenza: string | null;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
  // Servono alla regola di selezionabilità e al badge "Acconto pagato".
  stato_contabile?: string | null;
  data_pagamento_effettiva?: string | null;
  tempi_scadenza_key?: string | null;
  importo_pagato?: number | string | null;
};

/**
 * Definizione canonica di "scadenza selezionabile": vedi commento in testa al file.
 * Gemella del filtro `.or(...)` della query qui sotto: se cambia una, cambia l'altra.
 */
export function scadenzaSelezionabile(s: {
  importo_scadenza?: number | string | null;
  stato_contabile?: string | null;
  data_pagamento_effettiva?: string | null;
  tempi_scadenza_key?: string | null;
  importo_pagato?: number | string | null;
}): boolean {
  if (Number(s.importo_scadenza ?? 0) <= 0) return false;
  // Le rate chiuse in anticipo da Gamma sono pagate: non sono scadenze aperte.
  if (scadenzaChiusaAnticipata(s)) return false;
  // a) nessun pagamento registrato, oppure b) partita ancora Aperta con acconto.
  return s.data_pagamento_effettiva == null || s.stato_contabile === "Aperta";
}

/**
 * Acconto registrato su una partita ancora Aperta (caso b della regola):
 * data di pagamento valorizzata da Gamma + stato Aperta + quota pagata > 0.
 * Rende visibile il badge "Acconto pagato" accanto al documento.
 */
export function accontoSuScadenzaAperta(s: {
  stato_contabile?: string | null;
  data_pagamento_effettiva?: string | null;
  importo_pagato?: number | string | null;
}): { importo: number; data: string } | null {
  if (s.data_pagamento_effettiva == null || s.stato_contabile !== "Aperta") return null;
  const importo = Number(s.importo_pagato ?? 0);
  if (importo <= 0) return null;
  return { importo, data: String(s.data_pagamento_effettiva) };
}

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
        .select("id, numero_documento, data_scadenza, importo_scadenza, giorni_ritardo, stato_contabile, data_pagamento_effettiva, tempi_scadenza_key, importo_pagato")
        .eq("cliente_id", clienteId)
        // a) nessun pagamento registrato, oppure b) partita Aperta con acconto:
        //    Gamma valorizza data_pagamento_effettiva anche sui pagamenti parziali.
        .or("data_pagamento_effettiva.is.null,stato_contabile.eq.Aperta")
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      // Regola canonica (importo > 0 + esclusi i chiusi in anticipo): vedi
      // scadenzaSelezionabile, gemella del .or(...) qui sopra.
      return (data ?? []).filter((s) => scadenzaSelezionabile(s)) as ScadenzaAperta[];
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
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right hidden sm:table-cell">gg ritardo</TableHead>
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
                    <TableCell className="text-sm whitespace-nowrap">{fmtDate(s.data_scadenza)}{(s.giorni_ritardo ?? 0) > 0 && (<div className="sm:hidden mt-0.5"><Badge className="bg-orange-500 text-white hover:bg-orange-500 text-[10px] px-1.5 py-0">{s.giorni_ritardo} gg</Badge></div>)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtEuro(s.importo_scadenza)}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
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
