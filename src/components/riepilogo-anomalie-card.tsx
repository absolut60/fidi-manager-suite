import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = {
  campo: string;
  tipo_anomalia: string;
  valore_nuovo: string | null;
  importazione_id: string | null;
  created_at: string;
};

type Riepilogo = {
  isEmpty: boolean;
  ultimoImportId: string | null;
  ultimoImportData: string | null;
  totale: number;
  emailAzzerate: number;
  pecAzzerate: number;
  emailMultipleSplittate: number;
  pecMultipleSplittate: number;
  cambiBlocco: number;
  altre: number;
};

async function fetchRiepilogo(): Promise<Riepilogo> {
  // Trova l'ultimo importazione_id con anomalie
  const { data: latest } = await supabase
    .from("anomalie_import" as never)
    .select("importazione_id, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  const latestRow = (latest as unknown as Row[] | null)?.[0];
  if (!latestRow) {
    return {
      isEmpty: true,
      ultimoImportId: null,
      ultimoImportData: null,
      totale: 0,
      emailAzzerate: 0,
      pecAzzerate: 0,
      emailMultipleSplittate: 0,
      pecMultipleSplittate: 0,
      cambiBlocco: 0,
      altre: 0,
    };
  }

  const importId = latestRow.importazione_id;
  // Carica tutte le anomalie di quell'import
  const { data, error } = await supabase
    .from("anomalie_import" as never)
    .select("campo, tipo_anomalia, valore_nuovo")
    .eq("importazione_id", importId as never)
    .limit(50000);
  if (error) throw error;

  const rows = (data as unknown as Row[]) ?? [];
  let emailAzz = 0,
    pecAzz = 0,
    emailMult = 0,
    pecMult = 0,
    blocco = 0,
    altre = 0;
  for (const r of rows) {
    if (r.campo === "email" && r.valore_nuovo === "azzerato") emailAzz++;
    else if (r.campo === "pec" && r.valore_nuovo === "azzerato") pecAzz++;
    else if (r.campo === "email" && r.tipo_anomalia === "multipla") emailMult++;
    else if (r.campo === "pec" && r.tipo_anomalia === "multipla") pecMult++;
    else if (r.tipo_anomalia === "cambio_blocco") blocco++;
    else altre++;
  }

  return {
    isEmpty: false,
    ultimoImportId: importId,
    ultimoImportData: latestRow.created_at,
    totale: rows.length,
    emailAzzerate: emailAzz,
    pecAzzerate: pecAzz,
    emailMultipleSplittate: emailMult,
    pecMultipleSplittate: pecMult,
    cambiBlocco: blocco,
    altre,
  };
}

export function RiepilogoAnomalieCard() {
  const q = useQuery({
    queryKey: ["anomalie-import", "riepilogo"],
    queryFn: fetchRiepilogo,
    refetchInterval: 30000,
  });

  const r = q.data;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        <h2 className="font-semibold">Riepilogo anomalie ultimo import</h2>
        {r && !r.isEmpty && (
          <Badge variant="secondary">{r.totale.toLocaleString("it-IT")}</Badge>
        )}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !r || r.isEmpty ? (
        <p className="text-sm text-muted-foreground">
          Nessuna anomalia registrata. Verrà popolata al prossimo import.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            Import del{" "}
            {r.ultimoImportData
              ? new Date(r.ultimoImportData).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
            : <span className="font-medium text-foreground">{r.totale.toLocaleString("it-IT")} anomalie</span>{" "}
            registrate.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Stat label="Email azzerate" value={r.emailAzzerate} />
            <Stat label="PEC azzerate" value={r.pecAzzerate} />
            <Stat label="Email multiple → split PEC" value={r.emailMultipleSplittate} />
            <Stat label="PEC multiple → split" value={r.pecMultipleSplittate} />
            <Stat label="Cambi blocco" value={r.cambiBlocco} />
            <Stat label="Altre" value={r.altre} />
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              Per il dettaglio riga-per-riga usa l'export &laquo;Anomalie import (tutte)&raquo; nella card Export, oppure l'export &laquo;Anomalie&raquo; del singolo import nello storico. Le correzioni vanno fatte nel gestionale.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">
        {value.toLocaleString("it-IT")}
      </div>
    </div>
  );
}
