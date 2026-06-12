import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  FileDown,
  Loader2,
  TrendingUp,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useBackgroundImport, type BackgroundImportProgress } from "@/lib/use-background-import";
import { triggerImport } from "@/lib/import.functions";
import { MACROCATEGORIE, CATEGORIE } from "@/lib/macrocategorie";
import { CODICI_PAGAMENTO } from "@/lib/codici-pagamento";
import { AnomalieImportCard, useAnomalieCount } from "@/components/anomalie-import-card";

export const Route = createFileRoute("/_app/import-export")({
  component: ImportExportPage,
});

/* ============================================================================
 * Shared: progress block for background imports
 * ============================================================================ */
function BgProgressBlock({
  progress,
  fallbackTotal,
}: {
  progress: BackgroundImportProgress;
  fallbackTotal: number;
}) {
  const total = Number(progress.righe_totali ?? fallbackTotal ?? 0);
  const elaborate = Number(progress.righe_elaborate ?? 0);
  const rawPct = total > 0 ? Math.min(100, Math.round((elaborate / total) * 100)) : 0;
  // Mantieni il massimo raggiunto — la barra non torna mai indietro
  const [maxPct, setMaxPct] = useState(0);
  useEffect(() => {
    setMaxPct((prev) => Math.max(prev, rawPct));
  }, [rawPct]);
  const pct = maxPct;
  return (
    <div className="space-y-2 mb-4 p-3 rounded-md border bg-muted/30 text-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        <span className="font-medium">Import in corso in background</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {(progress.righe_elaborate ?? 0).toLocaleString("it-IT")} / {(Number(progress.righe_totali ?? fallbackTotal ?? 0)).toLocaleString("it-IT")} righe ({pct}%) ·{" "}
        {progress.righe_create ?? 0} create · {progress.righe_aggiornate ?? 0} aggiornate ·{" "}
        {progress.righe_errore ?? 0} errori
        {(progress.righe_saltate ?? 0) > 0 ? (
          <>
            {" · "}
            <span className="text-amber-600">
              {progress.righe_saltate} saltate
              {progress.codici_mancanti?.length
                ? ` (${progress.codici_mancanti.length} clienti non in anagrafica)`
                : ""}
            </span>
          </>
        ) : null}
      </div>
      {(() => {
        const report = progress.report_saltati ?? null;
        const cnt = report?.cliente_non_trovato ?? {};
        const cntEntries = Object.entries(cnt);
        const erroriRiga = report?.errori_riga ?? [];
        const hasRichReport = cntEntries.length > 0 || erroriRiga.length > 0;
        const codes = progress.codici_mancanti ?? [];
        const hasLegacyCodes = codes.length > 0;

        if (!hasRichReport && !hasLegacyCodes) return null;

        return (
          <div className="flex flex-wrap gap-2">
            {hasRichReport ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const header = "codice_gestionale;ragione_sociale;righe_saltate";
                  const lines = cntEntries
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([cg, det]) => {
                      const rs = (det.ragione_sociale ?? "").replace(/"/g, '""');
                      return `"${cg.replace(/"/g, '""')}";"${rs}";${det.count}`;
                    });
                  const errSection = erroriRiga.length
                    ? "\n\nErrori riga:\nriga;errore\n" +
                      erroriRiga
                        .map(
                          (e) =>
                            `${e.riga};"${String(e.errore).replace(/"/g, '""')}"`,
                        )
                        .join("\n")
                    : "";
                  const csv = `${header}\n${lines.join("\n")}${errSection}`;
                  const blob = new Blob(["\uFEFF" + csv], {
                    type: "text/csv;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `report-saltati-${new Date()
                    .toISOString()
                    .slice(0, 10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="size-3 mr-1" />
                Report completo saltati
                {cntEntries.length
                  ? ` (${cntEntries.length} clienti${
                      erroriRiga.length ? `, ${erroriRiga.length} errori riga` : ""
                    })`
                  : erroriRiga.length
                    ? ` (${erroriRiga.length} errori riga)`
                    : ""}
              </Button>
            ) : null}
            {hasLegacyCodes && !hasRichReport ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const csv =
                    "codice_gestionale\n" +
                    codes
                      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
                      .join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `codici-mancanti-${new Date()
                    .toISOString()
                    .slice(0, 10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="size-3 mr-1" />
                Scarica codici mancanti ({codes.length})
              </Button>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}

/* ============================================================================
 * UTILS
 * ============================================================================ */

function normalize(h: string) {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Parse a worksheet skipping title/preamble rows.
 * Finds the header row (first row containing `headerKeyword` in any cell),
 * skips an optional description row right after, and returns objects keyed
 * by the header cells. Each object includes a __row property with the
 * original 1-based Excel row number for error reporting.
 */
function sheetToObjects(
  sheet: XLSX.WorkSheet,
  headerKeyword: string,
  opts: { forceSkipDescription?: boolean } = {},
): Array<Record<string, unknown> & { __row: number }> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const kw = normalize(headerKeyword);
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (
      row.some((c) => {
        const n = normalize(String(c ?? ""));
        return n === kw || n.startsWith(kw + " ");
      })
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const kwColIdx = headers.findIndex((h) => {
    const n = normalize(h);
    return n === kw || n.startsWith(kw + " ");
  });
  const nextRow = matrix[headerIdx + 1] ?? [];
  const nextKwCell = kwColIdx >= 0 ? String(nextRow[kwColIdx] ?? "").trim() : "";
  // Heuristic: row is a description row if its cell in keyword column is empty,
  // OR looks like a descriptive sentence (long text with spaces, not an email/number/code).
  const looksLikeDescription = (s: string) => {
    if (!s) return true;
    if (s.length > 25 && /\s/.test(s) && !/@/.test(s) && !/^\d/.test(s)) return true;
    return false;
  };
  const skipDesc =
    opts.forceSkipDescription || nextKwCell === "" || looksLikeDescription(nextKwCell);
  const dataStart = skipDesc ? headerIdx + 2 : headerIdx + 1;
  const out: Array<Record<string, unknown> & { __row: number }> = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = row[j] ?? "";
    });
    out.push(Object.assign(obj, { __row: i + 1 }));
  }
  return out;
}

function anagraficaSheetToObjects(
  sheet: XLSX.WorkSheet,
): Array<Record<string, unknown> & { __row: number }> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (!matrix.length) return [];

  const rowHasRagSoc = (r: unknown[] | undefined) =>
    (r ?? []).some((c) => normalize(String(c ?? "")) === "ragione sociale");

  let headerIdx = -1;
  let dataStart = -1;
  if (rowHasRagSoc(matrix[0])) {
    headerIdx = 0;
    dataStart = 1;
  } else if (rowHasRagSoc(matrix[1])) {
    headerIdx = 1;
    dataStart = 3; // riga 3 = descrizioni, dati da riga 4
  } else {
    return [];
  }

  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const dataRows = matrix.slice(dataStart);

  const out: Array<Record<string, unknown> & { __row: number }> = [];
  dataRows.forEach((row, idx) => {
    const r = row ?? [];
    if (!r.some((c) => String(c ?? "").trim() !== "")) return;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = r[j] ?? "";
    });
    out.push(Object.assign(obj, { __row: dataStart + idx + 1 }));
  });
  return out;
}

function ImportExportPage() {
  const anomalieCount = useAnomalieCount();
  const queryClient = useQueryClient();
  useEffect(() => {
    // Marca automaticamente come falliti gli import bloccati da più di 4 ore
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    supabase
      .from("importazioni")
      .update({
        stato: "completata_con_errori",
        completata_at: new Date().toISOString(),
        log_errori: "Import interrotto automaticamente (timeout 4 ore).",
      })
      .eq("stato", "in_elaborazione")
      .lt("created_at", cutoff)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["storico-import-export", "importazioni"] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Import / Export</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importa anagrafiche o dati di rischio da Excel ed esporta i dati per analisi.
          </p>
        </div>
        {(anomalieCount.data ?? 0) > 0 && (
          <a
            href="#anomalie-import"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm font-medium"
          >
            Anomalie in attesa
            <Badge variant="secondary">{anomalieCount.data}</Badge>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnagraficaImportCard />
        <RischioImportCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScadenziarioImportCard />
        <ExportCard />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <ScadenziarioAssicurazioniImportCard />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <BloccoFidoAssicurazioneImportCard />
      </div>

      {(anomalieCount.data ?? 0) > 0 && (
        <div id="anomalie-import" className="grid grid-cols-1 gap-6">
          <AnomalieImportCard />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <HistoryCard kind="importazioni" />
      </div>
    </div>
  );
}


/* ============================================================================
 * A — ANAGRAFICA
 * ============================================================================ */

const optStr = (max: number, _msg?: string) =>
  z.preprocess((v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    if (s === "") return undefined;
    return s.length > max ? s.slice(0, max) : s;
  }, z.string().optional());

function extractFirstValidEmail(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255) return s;
  const parts = s.split(/[;\s]+/);
  for (const part of parts) {
    const p = part.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p) && p.length <= 255) return p;
  }
  return undefined;
}

const optEmail = z.preprocess((v) => extractFirstValidEmail(v), z.string().optional());

const optPec = z.preprocess((v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255) return s;
  return undefined;
}, z.string().optional());

const anagraficaSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Ragione sociale obbligatoria").max(200),
  codice_gestionale: optStr(50),
  partita_iva: optStr(20),
  codice_fiscale: optStr(20),
  forma_giuridica: optStr(100),
  indirizzo: optStr(200),
  citta: optStr(100),
  cap: optStr(10),
  provincia: optStr(5),
  telefono: optStr(30),
  telefono_2: optStr(30),
  cellulare: optStr(30),
  email: optEmail,
  pec: optPec,
  codice_sdi: optStr(20),
  codice_macrocategoria: optStr(10),
  macrocategoria: optStr(100),
  codice_categoria: optStr(10),
  categoria: optStr(100),
  store_codice: optStr(50),
  condizione_pagamento_cod: optStr(20),
  condizione_pagamento_desc: optStr(255),
  note: optStr(1000),
});

type AnagraficaRow = z.infer<typeof anagraficaSchema>;

const ANAG_HEADERS: Record<string, keyof AnagraficaRow> = {
  "ragione sociale": "ragione_sociale",
  ragionesociale: "ragione_sociale",
  denominazione: "ragione_sociale",
  "codice gestionale": "codice_gestionale",
  codice: "codice_gestionale",
  "cod gestionale": "codice_gestionale",
  "partita iva": "partita_iva",
  partita_iva: "partita_iva",
  "partira iva": "partita_iva",
  partira_iva: "partita_iva",
  "p iva": "partita_iva",
  piva: "partita_iva",
  "codice fiscale": "codice_fiscale",
  codice_fiscale: "codice_fiscale",
  cf: "codice_fiscale",
  "forma giuridica": "forma_giuridica",
  forma_giuridica: "forma_giuridica",
  indirizzo: "indirizzo",
  via: "indirizzo",
  citta: "citta",
  città: "citta",
  cap: "cap",
  provincia: "provincia",
  prov: "provincia",
  telefono: "telefono",
  tel: "telefono",
  "telefono 2": "telefono_2",
  telefono2: "telefono_2",
  telefono_2: "telefono_2",
  "tel 2": "telefono_2",
  cellulare: "cellulare",
  cell: "cellulare",
  email: "email",
  "e mail": "email",
  mail: "email",
  pec: "pec",
  "codice sdi": "codice_sdi",
  codice_sdi: "codice_sdi",
  sdi: "codice_sdi",
  "codice macrocategoria": "codice_macrocategoria",
  codice_macrocategoria: "codice_macrocategoria",
  macrocategoria: "macrocategoria",
  "codice categoria": "codice_categoria",
  codice_categoria: "codice_categoria",
  categoria: "categoria",
  "store codice": "store_codice",
  store: "store_codice",
  "punto vendita": "store_codice",
  "cod pagamento": "condizione_pagamento_cod",
  "desc pagamento": "condizione_pagamento_desc",
  "condizione pagamento cod": "condizione_pagamento_cod",
  "condizione pagamento desc": "condizione_pagamento_desc",
  note: "note",
};

type ParsedRow<T> = { idx: number; data: T; errors: string[] };

function AnagraficaImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow<AnagraficaRow>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importazioneId, setImportazioneId] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ riga: number; errore: string }>;
  }>(null);

  function reset() {
    setFileName(null);
    setFile(null);
    setRows([]);
    setResult(null);
    setImportazioneId(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(f: File) {
    setParsing(true);
    setResult(null);
    setImportazioneId(null);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = anagraficaSheetToObjects(sheet);
      if (!raw.length) {
        toast.error(
          "Nessuna riga dati trovata: verifica che la riga 2 contenga le intestazioni e che i dati inizino dalla riga 4",
        );
        return;
      }

      const parsed: ParsedRow<AnagraficaRow>[] = raw.map((r) => {
        const mapped: Record<string, string> = {};
        for (const k of Object.keys(r)) {
          if (k === "__row") continue;
          const fkey = ANAG_HEADERS[normalize(k)];
          if (fkey) mapped[fkey] = String(r[k] ?? "").trim();
        }
        // Padding codici numerici a 2 cifre (es. "1" → "01")
        if (mapped.codice_macrocategoria) {
          const c = String(mapped.codice_macrocategoria).trim();
          mapped.codice_macrocategoria = /^\d$/.test(c) ? c.padStart(2, "0") : c;
        }
        if (mapped.codice_categoria) {
          const c = String(mapped.codice_categoria).trim();
          mapped.codice_categoria = /^\d$/.test(c) ? c.padStart(2, "0") : c;
        }
        // Trim spazi su campi critici
        if (mapped.codice_sdi) mapped.codice_sdi = String(mapped.codice_sdi).trim();
        if (mapped.partita_iva) mapped.partita_iva = String(mapped.partita_iva).trim();
        if (mapped.codice_gestionale)
          mapped.codice_gestionale = String(mapped.codice_gestionale).trim();
        // Auto-completamento label da codice
        if (mapped.codice_macrocategoria && !mapped.macrocategoria) {
          const found = MACROCATEGORIE.find((m) => m.codice === mapped.codice_macrocategoria);
          if (found) mapped.macrocategoria = found.label;
        }
        if (mapped.codice_categoria && !mapped.categoria) {
          const found = CATEGORIE.find((c) => c.codice === mapped.codice_categoria);
          if (found) mapped.categoria = found.label;
        }
        if (mapped.condizione_pagamento_cod && !mapped.condizione_pagamento_desc) {
          const found = CODICI_PAGAMENTO.find((c) => c.cod === mapped.condizione_pagamento_cod);
          if (found) mapped.condizione_pagamento_desc = found.desc;
        }
        const res = anagraficaSchema.safeParse(mapped);
        return {
          idx: r.__row,
          data: (res.success ? res.data : mapped) as AnagraficaRow,
          errors: res.success ? [] : res.error.issues.map((e) => `${e.path[0]}: ${e.message}`),
        };
      });
      setFileName(f.name);
      setFile(f);
      setRows(parsed);
      toast.success(`${parsed.length} righe lette (anteprima)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore lettura file");
    } finally {
      setParsing(false);
    }
  }

  // Una riga è valida se ha ragione_sociale — anche se ha warning sui singoli campi
  const valid = rows.filter((r) => r.data.ragione_sociale);
  // Invalid solo se manca ragione_sociale
  const invalid = rows.filter((r) => !r.data.ragione_sociale);
  // Righe con warning (campi azzerati ma riga importata comunque)
  const withWarnings = rows.filter((r) => r.data.ragione_sociale && r.errors.length > 0);

  // Avvio import: upload + inserimento importazione + trigger Inngest.
  // Il processing prosegue lato server anche se l'utente chiude la pagina.
  const importMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Nessun file selezionato");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 1) Crea record importazione (così abbiamo l'ID per nominare il file)
      const { data: imp, error: impErr } = await supabase
        .from("importazioni")
        .insert({
          nome_file: fileName ?? "anagrafica.xlsx",
          righe_totali: rows.length,
          righe_errore: invalid.length,
          stato: "in_elaborazione",
          fonte: "anagrafica",
          eseguita_da: user?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      // 2) Upload file su storage
      const filePath = `${imp.id}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("import-files").upload(filePath, file, {
        contentType:
          file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (upErr) {
        await supabase
          .from("importazioni")
          .update({
            stato: "completata_con_errori",
            completata_at: new Date().toISOString(),
            log_errori: [{ riga: 0, errore: `Upload fallito: ${upErr.message}` }],
          })
          .eq("id", imp.id);
        throw upErr;
      }
      await supabase.from("importazioni").update({ file_path: filePath }).eq("id", imp.id);

      // 3) Trigger Inngest via serverFn
      const { triggerAnagraficaImport } = await import("@/lib/import.functions");
      await triggerAnagraficaImport({ data: { importazioneId: imp.id, filePath } });

      return imp.id;
    },
    onSuccess: (id) => {
      setImportazioneId(id);
      toast.success("Import avviato in background. Puoi chiudere la pagina, prosegue lato server.");
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Polling stato importazione mentre è in corso
  const { data: progress } = useQuery({
    queryKey: ["importazione-stato", importazioneId],
    queryFn: async () => {
      if (!importazioneId) return null;
      const { data } = await supabase
        .from("importazioni")
        .select(
          "stato, righe_totali, righe_elaborate, righe_create, righe_aggiornate, righe_errore, log_errori, completata_at",
        )
        .eq("id", importazioneId)
        .single();
      return data;
    },
    enabled: !!importazioneId && !result,
    refetchInterval: 2000,
  });

  // Quando il job termina aggiorno il riepilogo e invalido le query clienti
  if (
    progress &&
    !result &&
    (progress.stato === "completata" || progress.stato === "completata_con_errori")
  ) {
    const errs = Array.isArray(progress.log_errori)
      ? (progress.log_errori as Array<{ riga: number; errore: string }>)
      : [];
    setResult({
      created: progress.righe_create ?? 0,
      updated: progress.righe_aggiornate ?? 0,
      skipped:
        (progress.righe_errore ?? 0) - errs.length < 0
          ? 0
          : (progress.righe_errore ?? 0) - errs.length,
      errors: errs,
    });
    qc.invalidateQueries({ queryKey: ["clienti"] });
    qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    toast.success("Import completato");
  }

  const inProgress = !!importazioneId && !result;

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        codice_gestionale: "260",
        ragione_sociale: "EDIL.BA DI BALZAROTTI S.R.L.",
        store_codice: "1",
        indirizzo: "VIA ESEMPIO N.1",
        cap: "20004",
        citta: "ARLUNO",
        provincia: "MI",
        partita_iva: "00799950159",
        forma_giuridica: "azienda",
        codice_fiscale: "00799950159",
        telefono: "02/9017773",
        telefono_2: "",
        cellulare: "335/8476544",
        email: "info@esempio.it",
        pec: "esempio@pec.it",
        codice_macrocategoria: "01",
        macrocategoria: "IMPRESE EDILI",
        codice_categoria: "01",
        categoria: "IMPRESE Categoria A",
        codice_sdi: "W7YVJK9",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Anagrafica");
    XLSX.writeFile(wb, "template_anagrafica_clienti.xlsx");
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold flex items-center gap-2">
          <Upload className="size-4" /> A · Importa Anagrafica Clienti
        </h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={downloadTemplate}>
          <FileDown className="size-3.5" /> Template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Crea o aggiorna i clienti (upsert su <code>codice_gestionale</code> o{" "}
        <code>partita_iva</code>). L'elaborazione gira in background: puoi chiudere la pagina senza
        interrompere l'import.
      </p>
      {inProgress && progress ? (
        <div className="space-y-2 mb-4 p-3 rounded-md border bg-muted/30 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span className="font-medium">Import in corso in background</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {progress.righe_elaborate ?? 0} / {progress.righe_totali ?? rows.length} righe ·{" "}
            {progress.righe_create ?? 0} create · {progress.righe_aggiornate ?? 0} aggiornate ·{" "}
            {progress.righe_errore ?? 0} errori
          </div>
        </div>
      ) : null}
      <ImportZone
        fileName={fileName}
        parsing={parsing}
        dragOver={dragOver}
        setDragOver={setDragOver}
        fileRef={fileRef}
        onFile={handleFile}
        onReset={reset}
        valid={valid.length}
        invalid={invalid}
        withWarnings={withWarnings}
        result={result}
        action={
          <Button
            className="w-full gap-1.5"
            disabled={!valid.length || importMut.isPending || inProgress}
            onClick={() => importMut.mutate()}
          >
            {(importMut.isPending || inProgress) && <Loader2 className="size-4 animate-spin" />}
            {inProgress ? "Elaborazione in background..." : `Avvia import (${valid.length} righe)`}
          </Button>
        }
      />
    </Card>
  );
}

/* ============================================================================
 * B — ANALISI RISCHIO
 * ============================================================================ */

const RISCHIO_HEADERS: Record<string, string> = {
  codice: "codice_gestionale",
  "cod cliente": "codice_gestionale",
  "codice cliente": "codice_gestionale",
  "ragione sociale": "ragione_sociale",
  "cod pag": "condizione_pagamento_cod",
  "cod pagamento": "condizione_pagamento_cod",
  "codice pagamento": "condizione_pagamento_cod",
  "descr cod pag": "condizione_pagamento_desc",
  "descrizione cod pag": "condizione_pagamento_desc",
  "descrizione pagamento": "condizione_pagamento_desc",
  "saldo contab": "saldo_contabile",
  "saldo contabile": "saldo_contabile",
  "doc da fatt": "doc_da_fatturare",
  "doc da fatturare": "doc_da_fatturare",
  "doc da evad": "doc_da_evadere",
  "doc da evadere": "doc_da_evadere",
  "eff a rischio": "effetti_a_rischio",
  "effetti a rischio": "effetti_a_rischio",
  fido: "fido_gestionale",
  "fido azienda": "fido_gestionale",
  "fido concesso": "fido_gestionale",
  "fido gestionale": "fido_gestionale",
  "totale rischio": "totale_rischio",
  "tot rischio": "totale_rischio",
  "fido residuo": "fido_residuo",
  residuo: "fido_residuo",
  scaduto: "scaduto",
  "a scadere": "a_scadere",
  "num insoluti": "num_insoluti",
  "n insoluti": "num_insoluti",
  insoluti: "num_insoluti",
  "dilaz azienda": "dilazione_concordata",
  "dilazione azienda": "dilazione_concordata",
  "dilaz concordata": "dilazione_concordata",
  "dilaz effettiva": "dilazione_effettiva",
  "dilazione effettiva": "dilazione_effettiva",
};

type RischioRow = {
  idx: number;
  codice_gestionale: string;
  ragione_sociale: string;
  payload: Record<string, unknown>;
};

function RischioImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const bg = useBackgroundImport({
    fonte: "analisi_rischio",
    invalidateKeys: [["clienti"], ["cliente"]],
  });

  function reset() {
    setFileName(null);
    setFile(null);
    bg.reset();
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(f: File) {
    setFileName(f.name);
    setFile(f);
    bg.reset();
    toast.success(`File pronto: ${f.name}`);
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        Codice: "13908",
        "Ragione sociale": "Esempio S.r.l.",
        "Cod.pag.": "RB22",
        "Descr.cod.pag.": "R.B. 60 gg. d.f. f.m.",
        "Saldo contab.": 1500,
        "Doc. da fatt.": 500,
        "Doc. da evad.": 0,
        "Eff. a rischio": 0,
        Fido: 50000,
        "Totale rischio": 32000,
        "Fido residuo": 18000,
        Scaduto: 0,
        "A scadere": 32000,
        "Num.insoluti": 0,
        "Dilaz.azienda": 60,
        "Dilaz.effettiva": 65,
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analisi rischio");
    XLSX.writeFile(wb, "template_analisi_rischio.xlsx");
  }

  const result =
    bg.done && bg.progress
      ? {
          created: bg.progress.righe_create ?? 0,
          updated: bg.progress.righe_aggiornate ?? 0,
          skipped: bg.progress.righe_errore ?? 0,
          errors: Array.isArray(bg.progress.log_errori)
            ? (bg.progress.log_errori as Array<{ riga: number; errore: string }>)
            : [],
        }
      : null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold flex items-center gap-2">
          <TrendingUp className="size-4" /> B · Importa Analisi Rischio
        </h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={downloadTemplate}>
          <FileDown className="size-3.5" /> Template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Aggiorna dati rischio dei clienti esistenti (match su <code>Codice</code>). Elaborazione in
        background.
      </p>
      {bg.inProgress && bg.progress ? (
        <BgProgressBlock progress={bg.progress} fallbackTotal={0} />
      ) : null}
      <ImportZone
        fileName={fileName}
        parsing={false}
        dragOver={dragOver}
        setDragOver={setDragOver}
        fileRef={fileRef}
        onFile={handleFile}
        onReset={reset}
        valid={file ? 1 : 0}
        invalid={[]}
        result={result}
        action={
          <Button
            className="w-full gap-1.5"
            disabled={!file || bg.isPending || bg.inProgress}
            onClick={() => file && bg.start({ file, rowsTotali: 0 })}
          >
            {(bg.isPending || bg.inProgress) && <Loader2 className="size-4 animate-spin" />}
            {bg.inProgress ? "Elaborazione in background..." : "Avvia import rischio"}
          </Button>
        }
      />
    </Card>
  );
}

/* ============================================================================
 * IMPORT ZONE (shared UI)
 * ============================================================================ */

function ImportZone(props: {
  fileName: string | null;
  parsing: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onReset: () => void;
  valid: number;
  invalid: Array<{ idx: number; errors: string[] }>;
  withWarnings?: Array<{ idx: number; errors: string[] }>;
  result: null | {
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ riga: number; errore: string }>;
  };
  action: React.ReactNode;
}) {
  const {
    fileName,
    parsing,
    dragOver,
    setDragOver,
    fileRef,
    onFile,
    onReset,
    valid,
    invalid,
    withWarnings = [],
    result,
    action,
  } = props;
  if (!fileName) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Trascina il file qui o clicca per selezionare</p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {parsing && <Loader2 className="size-4 animate-spin mx-auto mt-3" />}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-md bg-muted">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="size-4 shrink-0" />
          <span className="text-sm truncate">{fileName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onReset}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="size-3" /> {valid} valide
        </Badge>
        {invalid.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="size-3" /> {invalid.length} scartate
          </Badge>
        )}
        {withWarnings.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="size-3" /> {withWarnings.length} con warning (campi non validi
            azzerati)
          </Badge>
        )}
      </div>
      {invalid.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Righe scartate (senza ragione sociale)</p>
          <div className="max-h-40 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Riga</TableHead>
                  <TableHead>Errori</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invalid.slice(0, 50).map((r) => (
                  <TableRow key={r.idx}>
                    <TableCell className="font-mono text-xs">{r.idx}</TableCell>
                    <TableCell className="text-xs text-destructive">
                      {r.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {withWarnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Righe con warning (importate, campi azzerati)</p>
          <div className="max-h-40 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Riga</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withWarnings.slice(0, 50).map((r) => (
                  <TableRow key={r.idx}>
                    <TableCell className="font-mono text-xs">{r.idx}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {result && (
        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <p className="text-xs font-medium">Esito ultimo import</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="default">{result.created} creati</Badge>
            <Badge variant="secondary">{result.updated} aggiornati</Badge>
            <Badge variant="outline">{result.skipped} saltati</Badge>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-32 overflow-auto text-xs text-muted-foreground space-y-0.5">
              {result.errors.slice(0, 30).map((e, i) => (
                <p key={i}>
                  <span className="font-mono">Riga {e.riga}:</span> {e.errore}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {action}
    </div>
  );
}

/* ============================================================================
 * C — SCADENZIARIO
 * ============================================================================ */

const SCAD_HEADERS: Record<string, string> = {
  "cod cli": "codice_gestionale",
  "codice cliente": "codice_gestionale",
  "cod cliente": "codice_gestionale",
  codice: "codice_gestionale",
  "ragione sociale": "ragione_sociale",
  "codice pagamento scad": "codice_pagamento",
  "codice pagamento": "codice_pagamento",
  "cod pag": "codice_pagamento",
  "descrizione pagamento": "descrizione_pagamento",
  "descr pagamento": "descrizione_pagamento",
  "numero documento origine": "numero_documento",
  "numero documento": "numero_documento",
  "num doc": "numero_documento",
  "sezionale documento": "sezionale",
  sezionale: "sezionale",
  "data documento": "data_documento",
  "data doc": "data_documento",
  "data scadenza": "data_scadenza",
  "anno partita": "anno_partita",
  tipologia: "tipologia_scadenza",
  "tipologia scadenza": "tipologia_scadenza",
  "importo scadenza": "importo_scadenza",
  importo: "importo_scadenza",
  "importo documento": "importo_documento",
  "importo originario": "importo_originario",
  "importo netto prev": "importo_netto_prev",
  "importo ritardo": "importo_ritardo",
  "giorni ritardo": "giorni_ritardo",
  "stato contabile": "stato_contabile",
  "data pagamento": "data_pagamento",
  "dilazione teorica": "dilazione_teorica",
  "dilazione effettiva": "dilazione_effettiva",
  "cod blocco": "cod_blocco",
  "codice blocco": "cod_blocco",
  "fido euro": "fido_euro",
  fido: "fido_euro",
  assicurazione: "assicurazione",
  sede: "sede",
  "in legale": "in_legale",
};

type ScadRow = {
  idx: number;
  codice_gestionale: string;
  ragione_sociale: string;
  payload: Record<string, unknown>;
};

const SCAD_OFFICIAL_MAP: Record<string, string> = {
  "cod cli": "codice_gestionale",
  cod_cli: "codice_gestionale",
  codcli: "codice_gestionale",
  "ragione sociale": "__ragsoc",
  "codice pagamento scad": "codice_pagamento",
  "descrizione pagamento": "descrizione_pagamento",
  "numero documento origine": "numero_documento",
  "sezionale documento": "sezionale",
  "data documento": "data_documento",
  "anno partita": "anno_partita",
  "tipologia scadenza": "tipologia_scadenza",
  "data scadenza": "data_scadenza",
  "stato contabile": "stato_contabile",
  "importo scadenza": "importo_scadenza",
  "importo documento": "importo_documento",
  "giorni ritardo": "giorni_ritardo",
  "dilazione effettiva": "dilazione_effettiva",
  "importo ritardo": "importo_ritardo",
  "data pagamento": "data_pagamento",
  "importo originario effetto": "importo_originario",
  "importo scadenza netto prev": "importo_netto_prev",
  "tempi scadenza": "tempi_scadenza",
  // Chiave sintetica per "_Tempi Scadenza" (vedi normalizeOfficialHeader)
  "__tempi scadenza": "tempi_scadenza_key",
};

// Distingue "Tempi Scadenza" da "_Tempi Scadenza" (entrambi collassano dopo normalize()).
function normalizeOfficialHeader(raw: unknown): string {
  const s = String(raw ?? "");
  const n = normalize(s);
  if (n === "tempi scadenza" && s.trim().startsWith("_")) return "__tempi scadenza";
  return n;
}

function excelDateToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) {
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    let yy = m1[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseOfficialScadenziarioSheet(sheet: XLSX.WorkSheet): {
  rows: ScadRow[];
  missing: number[];
  totRead: number;
} {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length < 3) return { rows: [], missing: [], totRead: 0 };
  const headers = (matrix[1] ?? []).map((c) => normalizeOfficialHeader(c));
  const numFields = new Set([
    "importo_scadenza",
    "importo_documento",
    "importo_originario",
    "importo_netto_prev",
    "importo_ritardo",
  ]);
  const intFields = new Set(["giorni_ritardo", "dilazione_effettiva", "anno_partita"]);
  const dateFields = new Set(["data_documento", "data_scadenza", "data_pagamento"]);
  const rows: ScadRow[] = [];
  const missing: number[] = [];
  let totRead = 0;
  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    totRead++;
    const mapped: Record<string, unknown> = {};
    let ragSoc = "";
    headers.forEach((h, j) => {
      const field = SCAD_OFFICIAL_MAP[h];
      if (!field) return;
      if (field === "__ragsoc") {
        ragSoc = String(row[j] ?? "").trim();
        return;
      }
      mapped[field] = row[j];
    });
    const codice = toStr(mapped.codice_gestionale)?.replace(/\.0$/, "");
    if (!codice) {
      missing.push(i + 1);
      continue;
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (k === "codice_gestionale") continue;
      if (numFields.has(k)) payload[k] = toNum(v);
      else if (intFields.has(k)) payload[k] = toInt(v);
      else if (dateFields.has(k)) payload[k] = excelDateToISO(v);
      else payload[k] = toStr(v);
    }
    rows.push({ idx: i + 1, codice_gestionale: codice, ragione_sociale: ragSoc, payload });
  }
  return { rows, missing, totRead };
}

type ScadPhase = "reading" | "ready" | "uploading" | "processing" | "done" | "done-warn" | "error";

function formatDuration(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const totSec = Math.floor(ms / 1000);
  const m = Math.floor(totSec / 60);
  const s = totSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function ScadenziarioProgressBlock({
  phase,
  pct,
  righeElaborate,
  righeTotali,
  chunkCurrent,
  chunkTotal,
  elapsedMs,
  remainingMs,
  errorMsg,
  result,
  onRetry,
}: {
  phase: ScadPhase;
  pct: number;
  righeElaborate: number;
  righeTotali: number;
  chunkCurrent: number;
  chunkTotal: number;
  elapsedMs: number;
  remainingMs: number | null;
  errorMsg?: string | null;
  result?: {
    create: number;
    aggiornate: number;
    errori: number;
    chiuse: number;
  } | null;
  onRetry?: () => void;
}) {
  const barColor =
    phase === "error"
      ? "bg-destructive"
      : phase === "done-warn"
        ? "bg-yellow-500"
        : phase === "done"
          ? "bg-green-500"
          : "bg-primary";

  const phaseText: Record<ScadPhase, string> = {
    reading: "Lettura file Excel in corso…",
    ready:
      righeTotali > 0
        ? `Trovate ${righeTotali.toLocaleString("it-IT")} righe da elaborare`
        : "File pronto",
    uploading: "Caricamento file in corso…",
    processing: "Elaborazione in background…",
    done: "Importazione completata!",
    "done-warn": "Completata con errori — vedi dettagli",
    error: errorMsg ?? "Errore durante l'importazione",
  };

  return (
    <div className="space-y-3 mb-4 p-4 rounded-lg border bg-muted/30">
      <div className="flex items-baseline justify-between">
        <div className="text-3xl font-bold tabular-nums">{Math.round(pct)}%</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Tempo: {formatDuration(elapsedMs)}
          {remainingMs != null && phase === "processing" ? (
            <> · Rimanente: ~{formatDuration(remainingMs)}</>
          ) : null}
        </div>
      </div>
      <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-sm font-medium">
        {phase === "done" ? (
          <CheckCircle2 className="size-4 text-green-600" />
        ) : phase === "error" ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : phase === "done-warn" ? (
          <AlertCircle className="size-4 text-yellow-600" />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <span>{phaseText[phase]}</span>
      </div>
      {phase === "processing" && righeTotali > 0 ? (
        <div className="text-xs text-muted-foreground tabular-nums">
          {righeElaborate.toLocaleString("it-IT")} / {righeTotali.toLocaleString("it-IT")} righe
          elaborate
        </div>
      ) : null}
      {(phase === "done" || phase === "done-warn") && result ? (
        <div className="text-xs text-muted-foreground">
          Create:{" "}
          <span className="font-medium text-foreground">
            {result.create.toLocaleString("it-IT")}
          </span>
          {" · "}Aggiornate:{" "}
          <span className="font-medium text-foreground">
            {result.aggiornate.toLocaleString("it-IT")}
          </span>
          {" · "}Saltate:{" "}
          <span className="font-medium text-foreground">
            {result.errori.toLocaleString("it-IT")}
          </span>
          {result.chiuse > 0 ? (
            <>
              {" · "}Chiuse automaticamente:{" "}
              <span className="font-medium text-foreground">
                {result.chiuse.toLocaleString("it-IT")}
              </span>
            </>
          ) : null}
          {" · "}Tempo totale:{" "}
          <span className="font-medium text-foreground">{formatDuration(elapsedMs)}</span>
        </div>
      ) : null}
      {phase === "error" && onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <Loader2 className="size-3.5" /> Riprova
        </Button>
      ) : null}
    </div>
  );
}

function ScadenziarioImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{
    rows: ScadRow[];
    missing: number[];
    totRead: number;
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Progress tracking (2 phases: uploading 0-20%, processing 20-100%)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const bg = useBackgroundImport({
    fonte: "scadenziario",
    invalidateKeys: [["scadenze"], ["clienti"]],
    onUploadComplete: () => setUploadDone(true),
    onError: (msg) => setErrorMsg(msg),
  });

  // tick every second while active for elapsed/remaining time
  const isActive = parsing || bg.isPending || bg.inProgress || (!!bg.done && !!bg.progress);
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  function reset() {
    setFileName(null);
    setFile(null);
    setParsed(null);
    setStartedAt(null);
    setErrorMsg(null);
    setUploadDone(false);
    bg.reset();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(f: File) {
    setParsing(true);
    setParsed(null);
    setErrorMsg(null);
    setUploadDone(false);
    setStartedAt(Date.now());
    bg.reset();
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const sheetName = wb.SheetNames.find((name) => normalize(name) === "scadenziario");
      if (!sheetName) throw new Error("Foglio SCADENZIARIO non trovato nel file");
      const sheet = wb.Sheets[sheetName];
      if (!sheet) throw new Error("Foglio SCADENZIARIO non trovato nel file");
      const nextParsed = parseOfficialScadenziarioSheet(sheet);
      if (!nextParsed.totRead) throw new Error("Nessuna riga dati trovata nel foglio SCADENZIARIO");
      setFileName(f.name);
      setFile(f);
      setParsed(nextParsed);
      toast.success(
        `${nextParsed.totRead} righe lette: ${nextParsed.rows.length} valide, ${nextParsed.missing.length} senza COD_CLI`,
      );
    } catch (e) {
      setFileName(null);
      setFile(null);
      setParsed(null);
      setStartedAt(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.error(e instanceof Error ? e.message : "Errore lettura file");
    } finally {
      setParsing(false);
    }
  }

  function startImport() {
    if (!file || !parsed) return;
    setUploadDone(false);
    setErrorMsg(null);
    setStartedAt(Date.now());
    bg.start({
      file,
      rowsTotali: parsed.totRead,
      rigeErroreClient: parsed.missing.length,
      scadenziarioStaging: {
        rows: parsed.rows as unknown as Array<Record<string, unknown>>,
        missing: parsed.missing,
        chunkSize: 1000,
      },
    });
  }

  // Phase + pct derivation (2 fasi)
  const totRead = parsed?.totRead ?? bg.progress?.righe_totali ?? 0;
  const righeElaborate = bg.progress?.righe_elaborate ?? 0;
  const righeTotali = bg.progress?.righe_totali ?? totRead;

  let phase: ScadPhase;
  let pct = 0;
  if (errorMsg) {
    phase = "error";
    pct = 0;
  } else if (parsing) {
    phase = "reading";
    pct = 5;
  } else if (bg.done && bg.progress) {
    const stato = bg.progress.stato;
    if (stato === "completata_con_errori" || (bg.progress.righe_errore ?? 0) > 0) {
      phase = "done-warn";
    } else {
      phase = "done";
    }
    pct = 100;
  } else if (bg.inProgress && uploadDone) {
    // Fase 2: elaborazione in background (20% → 100%)
    phase = "processing";
    pct = righeTotali > 0 ? 20 + Math.min(80, (righeElaborate / righeTotali) * 80) : 20;
  } else if (bg.isPending || (bg.inProgress && !uploadDone)) {
    // Fase 1: upload file (0% → 20%)
    phase = "uploading";
    pct = 10;
  } else if (parsed) {
    phase = "ready";
    pct = 0;
  } else {
    phase = "reading";
    pct = 0;
  }

  const elapsedMs = startedAt ? now - startedAt : 0;
  let remainingMs: number | null = null;
  if (phase === "processing" && righeElaborate > 0 && righeTotali > 0 && startedAt) {
    const procStart = startedAt;
    const elapsed = now - procStart;
    const totalEstimate = (elapsed / righeElaborate) * righeTotali;
    remainingMs = Math.max(0, totalEstimate - elapsed);
  }

  const showProgress = parsing || bg.isPending || bg.inProgress || bg.done || !!errorMsg;

  function downloadTemplate() {
    const head = [
      "COD_CLI",
      "Ragione Sociale",
      "Codice Pagamento Scad",
      "Descrizione Pagamento",
      "Numero Documento Origine",
      "Sezionale Documento",
      "Data Documento",
      "Anno Partita",
      "Tipologia Scadenza",
      "Data Scadenza",
      "Stato Contabile",
      "Importo Scadenza",
      "Importo Documento",
      "Giorni Ritardo",
      "Dilazione Effettiva",
      "Importo Ritardo",
      "Data Pagamento",
      "Importo Originario Effetto",
      "Importo Scadenza Netto Prev",
    ];
    const empty = new Array(head.length).fill("");
    const samples = [
      [
        "13908",
        "Esempio Alfa S.r.l.",
        "RB60",
        "R.B. 60 gg. d.f.",
        "FT-2025-0001",
        "1",
        "01/06/2025",
        2025,
        "RB",
        "30/08/2025",
        "Aperta",
        1200,
        1200,
        0,
        60,
        0,
        "",
        1200,
        1200,
      ],
      [
        "13908",
        "Esempio Alfa S.r.l.",
        "RB60",
        "R.B. 60 gg. d.f.",
        "FT-2025-0002",
        "1",
        "15/06/2025",
        2025,
        "RB",
        "13/09/2025",
        "Aperta",
        850.5,
        850.5,
        12,
        60,
        8.4,
        "",
        850.5,
        850.5,
      ],
      [
        "14210",
        "Esempio Beta S.p.A.",
        "BB30",
        "Bonifico 30 gg. d.f.",
        "FT-2025-0123",
        "2",
        "10/05/2025",
        2025,
        "BB",
        "09/06/2025",
        "Chiusa",
        3200,
        3200,
        0,
        30,
        0,
        "08/06/2025",
        3200,
        3200,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet([empty, head, ...samples]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SCADENZIARIO");
    XLSX.writeFile(wb, "template_scadenziario.xlsx");
  }

  const result =
    bg.done && bg.progress
      ? {
          created: bg.progress.righe_create ?? 0,
          updated: bg.progress.righe_aggiornate ?? 0,
          skipped: bg.progress.righe_errore ?? 0,
          errors: Array.isArray(bg.progress.log_errori)
            ? (bg.progress.log_errori as Array<{ riga: number; errore: string }>)
            : [],
        }
      : null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarClock className="size-4" /> C · Importa Scadenziario
        </h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={downloadTemplate}>
          <FileDown className="size-3.5" /> Template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Carica il file Excel: viene letto solo il foglio <code>SCADENZIARIO</code> (intestazioni in
        riga 2, dati da riga 3). Match cliente su <code>COD_CLI</code>. Chiave univoca: COD_CLI +
        Numero Documento + Sezionale.
      </p>
      {showProgress ? (
        <ScadenziarioProgressBlock
          phase={phase}
          pct={pct}
          righeElaborate={righeElaborate}
          righeTotali={righeTotali}
          chunkCurrent={0}
          chunkTotal={0}
          elapsedMs={elapsedMs}
          remainingMs={remainingMs}
          errorMsg={errorMsg}
          result={
            bg.done && bg.progress
              ? {
                  create: bg.progress.righe_create ?? 0,
                  aggiornate: bg.progress.righe_aggiornate ?? 0,
                  errori: bg.progress.righe_errore ?? 0,
                  chiuse: 0,
                }
              : null
          }
          onRetry={
            errorMsg
              ? () => {
                  setErrorMsg(null);
                  startImport();
                }
              : undefined
          }
        />
      ) : null}
      <ImportZone
        fileName={fileName}
        parsing={parsing}
        dragOver={dragOver}
        setDragOver={setDragOver}
        fileRef={fileRef}
        onFile={handleFile}
        onReset={reset}
        valid={parsed?.rows.length ?? 0}
        invalid={(parsed?.missing ?? [])
          .slice(0, 50)
          .map((idx) => ({ idx, errors: ["COD_CLI mancante"] }))}
        result={result}
        action={
          <Button
            className="w-full gap-1.5"
            disabled={
              !file || !parsed || !parsed.rows.length || bg.isPending || bg.inProgress || parsing
            }
            onClick={startImport}
          >
            {(bg.isPending || bg.inProgress) && <Loader2 className="size-4 animate-spin" />}
            {bg.inProgress
              ? "Elaborazione in background..."
              : `Avvia import scadenziario (${parsed?.totRead ?? 0} righe)`}
          </Button>
        }
      />
    </Card>
  );
}

/* ============================================================================
 * D — SCADENZIARIO + ASSICURAZIONI (file unico, due fogli)
 * ============================================================================ */

type ScadBlockRow = {
  excelRow: number;
  cod_cli: string;
  data_scadenza: string | null;
  descrizione_pagamento: string | null;
  note_legale: string | null;
  note_solleciti: string | null;
  cod_blocco: string | null;
  importo_scadenza: number | null;
  fido_euro: number | null;
  assicurazione: number | null;
  bloccato: boolean;
};

type AssicRow = {
  excelRow: number;
  cod_cli: string;
  data_inizio: string | null;
  data_scadenza: string | null;
  importo_assicurato: number | null;
  codice_pagamento: string | null;
};

function parseScadenziarioSheet(sheet: XLSX.WorkSheet): { rows: ScadBlockRow[]; totRead: number } {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  // Header at row 11 (index 10); data from row 12 (index 11)
  const rows: ScadBlockRow[] = [];
  let currentCod: string | null = null;
  let totRead = 0;
  for (let i = 11; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const colA = String(row[0] ?? "").trim();
    const colF = String(row[5] ?? "").trim();
    // skip subtotals
    if (/totale/i.test(colA) || /bloccato\s+totale/i.test(colF)) continue;
    // header row of a client block
    if (colA) {
      const m = colA.match(/-\s*(\d+)\s*$/);
      if (m) currentCod = m[1];
      // first row of block usually has no data scadenza; continue to also try parsing if it has one
    }
    const dataScadRaw = row[1];
    const data_scadenza = excelDateToISO(dataScadRaw);
    if (!data_scadenza) continue;
    if (!currentCod) continue;
    totRead += 1;
    const descr = toStr(row[2]);
    const noteLeg = toStr(row[3]);
    const noteSoll = toStr(row[4]);
    const blocco = toStr(row[5]);
    const isBloccato = !!blocco && /bloccato/i.test(blocco);
    const cleanNote = (s: string | null) => {
      if (!s) return null;
      const t = s.trim();
      if (!t || /^\(vuoto\)$/i.test(t)) return null;
      return t;
    };
    rows.push({
      excelRow: i + 1,
      cod_cli: currentCod,
      data_scadenza,
      descrizione_pagamento: descr,
      note_legale: cleanNote(noteLeg),
      note_solleciti: cleanNote(noteSoll),
      cod_blocco: blocco,
      importo_scadenza: toNum(row[7]),
      fido_euro: toNum(row[8]),
      assicurazione: toNum(row[9]),
      bloccato: isBloccato,
    });
  }
  return { rows, totRead };
}

function parseAssicurazioneSheet(sheet: XLSX.WorkSheet): AssicRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const out: AssicRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const cod = toStr(row[2]);
    if (!cod) continue;
    out.push({
      excelRow: i + 1,
      cod_cli: String(cod).replace(/\.0$/, ""),
      data_inizio: excelDateToISO(row[0]),
      data_scadenza: excelDateToISO(row[1]),
      importo_assicurato: toNum(row[9]),
      codice_pagamento: toStr(row[10]),
    });
  }
  return out;
}

function ScadenziarioAssicurazioniImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scadRows, setScadRows] = useState<ScadBlockRow[]>([]);
  const [assicRows, setAssicRows] = useState<AssicRow[]>([]);
  const [scadRead, setScadRead] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<null | { log: string[] }>(null);

  function reset() {
    setFileName(null);
    setScadRows([]);
    setAssicRows([]);
    setScadRead(0);
    setWarnings([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParsing(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const findSheet = (kw: string) => {
        const name =
          wb.SheetNames.find((n) => normalize(n) === normalize(kw)) ??
          wb.SheetNames.find((n) => normalize(n).includes(normalize(kw)));
        return name ? wb.Sheets[name] : null;
      };
      const sScad = findSheet("scadenziario");
      const sAssic = findSheet("assicurazione");
      const w: string[] = [];
      let parsedScad: ScadBlockRow[] = [];
      let scadTot = 0;
      if (!sScad) w.push("Foglio 'SCADENZIARIO' non trovato.");
      else {
        const r = parseScadenziarioSheet(sScad);
        parsedScad = r.rows;
        scadTot = r.totRead;
      }
      let parsedAssic: AssicRow[] = [];
      if (!sAssic) w.push("Foglio 'ASSICURAZIONE' non trovato.");
      else parsedAssic = parseAssicurazioneSheet(sAssic);
      setFileName(file.name);
      setScadRows(parsedScad);
      setAssicRows(parsedAssic);
      setScadRead(scadTot);
      setWarnings(w);
      toast.success(`Letti: ${parsedScad.length} scadenze, ${parsedAssic.length} polizze`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore lettura file");
    } finally {
      setParsing(false);
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const log: string[] = [...warnings];

      const { data: imp } = await supabase
        .from("importazioni")
        .insert({
          nome_file: fileName ?? "scadenziario_assicurazioni.xlsx",
          righe_totali: scadRows.length + assicRows.length,
          stato: "in_elaborazione",
          fonte: "scadenziario_assicurazioni",
          eseguita_da: user?.id ?? null,
        })
        .select("id")
        .single();

      // === Risolvi clienti per entrambi i fogli ===
      const allCodes = Array.from(
        new Set([...scadRows.map((r) => r.cod_cli), ...assicRows.map((r) => r.cod_cli)]),
      );
      const clientMap = new Map<string, string>();
      if (allCodes.length) {
        const { data } = await supabase
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", allCodes);
        (data ?? []).forEach((c) => {
          if (c.codice_gestionale) clientMap.set(String(c.codice_gestionale), c.id);
        });
      }

      // ====== SCADENZIARIO ======
      let scadCreated = 0,
        scadUpdated = 0,
        scadSkipped = 0;
      const matchedClients = new Set<string>();
      const clientsToBlock = new Set<string>();
      const clientsLegale = new Set<string>();

      // pre-carica scadenze esistenti per upsert (chiave cliente+data+descr)
      const clientIds = Array.from(new Set(Array.from(clientMap.values())));
      const existingScad = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabase
          .from("scadenze" as never)
          .select("id, cliente_id, data_scadenza, descrizione_pagamento")
          .in("cliente_id", clientIds);
        (
          (data ?? []) as Array<{
            id: string;
            cliente_id: string;
            data_scadenza: string | null;
            descrizione_pagamento: string | null;
          }>
        ).forEach((s) => {
          existingScad.set(
            `${s.cliente_id}|${s.data_scadenza ?? ""}|${s.descrizione_pagamento ?? ""}`,
            s.id,
          );
        });
      }

      // pre-carica solleciti esistenti (per dedup per cliente+nota)
      const existingSoll = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabase
          .from("solleciti" as never)
          .select("cliente_id, nota")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; nota: string }>).forEach((s) => {
          existingSoll.add(`${s.cliente_id}|${(s.nota ?? "").trim()}`);
        });
      }

      // pre-carica pratiche legali aperte
      const openLegale = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabase
          .from("pratiche_legali" as never)
          .select("cliente_id, stato")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; stato: string }>).forEach((p) => {
          if (p.stato !== "chiusa") openLegale.add(p.cliente_id);
        });
      }

      const now = new Date().toISOString();
      for (const r of scadRows) {
        const cid = clientMap.get(r.cod_cli);
        if (!cid) {
          scadSkipped += 1;
          log.push(`Riga ${r.excelRow}: cliente ${r.cod_cli} non trovato`);
          continue;
        }
        matchedClients.add(cid);
        const key = `${cid}|${r.data_scadenza ?? ""}|${r.descrizione_pagamento ?? ""}`;
        const existId = existingScad.get(key);
        const payload: Record<string, unknown> = {
          cliente_id: cid,
          data_scadenza: r.data_scadenza,
          descrizione_pagamento: r.descrizione_pagamento,
          importo_scadenza: r.importo_scadenza,
          fido_euro: r.fido_euro,
          assicurazione: r.assicurazione,
          cod_blocco: r.cod_blocco,
          importato_da: user?.id ?? null,
          ultima_sincronizzazione: now,
        };
        if (existId) {
          const { error } = await supabase
            .from("scadenze" as never)
            .update(payload as never)
            .eq("id", existId);
          if (error) {
            scadSkipped += 1;
            log.push(`Riga ${r.excelRow}: ${error.message}`);
          } else scadUpdated += 1;
        } else {
          const { error } = await supabase.from("scadenze" as never).insert(payload as never);
          if (error) {
            scadSkipped += 1;
            log.push(`Riga ${r.excelRow}: ${error.message}`);
          } else scadCreated += 1;
        }

        if (r.bloccato) clientsToBlock.add(cid);

        // Note Solleciti
        if (r.note_solleciti) {
          const dkey = `${cid}|${r.note_solleciti.trim()}`;
          if (!existingSoll.has(dkey)) {
            const { error } = await supabase.from("solleciti" as never).insert({
              cliente_id: cid,
              tipo: "interno",
              nota: r.note_solleciti,
              inserito_da: user?.id ?? null,
            } as never);
            if (!error) existingSoll.add(dkey);
            else log.push(`Riga ${r.excelRow}: sollecito ${error.message}`);
          }
        }

        // Note Legale
        if (r.note_legale && !openLegale.has(cid) && !clientsLegale.has(cid)) {
          const { error } = await supabase.from("pratiche_legali" as never).insert({
            cliente_id: cid,
            tipo: "azione_legale_generica",
            stato: "aperta",
            note: r.note_legale,
            gestita_da: user?.id ?? null,
          } as never);
          if (!error) {
            openLegale.add(cid);
            clientsLegale.add(cid);
          } else log.push(`Riga ${r.excelRow}: pratica legale ${error.message}`);
        }
      }

      // Blocco clienti
      if (clientsToBlock.size) {
        await supabase
          .from("clienti")
          .update({
            bloccato: true,
            data_blocco: now,
            motivo_blocco: "Import scadenziario: T_BLOCCO=BLOCCATO",
          } as never)
          .in("id", Array.from(clientsToBlock));
      }

      // ====== ASSICURAZIONI ======
      let assicCreated = 0,
        assicUpdated = 0,
        assicSkipped = 0;
      const assicClients = new Set<string>();

      // pre-carica polizze esistenti per cliente (POUEY)
      const existingPol = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabase
          .from("assicurazioni_credito" as never)
          .select("id, cliente_id")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
          if (!existingPol.has(p.cliente_id)) existingPol.set(p.cliente_id, p.id);
        });
      }

      for (const a of assicRows) {
        const cid = clientMap.get(a.cod_cli);
        if (!cid) {
          assicSkipped += 1;
          log.push(`Assic riga ${a.excelRow}: cliente ${a.cod_cli} non trovato`);
          continue;
        }
        assicClients.add(cid);
        const payload: Record<string, unknown> = {
          cliente_id: cid,
          assicuratore: "POUEY",
          data_inizio: a.data_inizio,
          data_scadenza: a.data_scadenza,
          importo_assicurato: a.importo_assicurato,
          importo_massimale: a.importo_assicurato,
          stato: "attiva",
        };
        const existId = existingPol.get(cid);
        if (existId) {
          const { error } = await supabase
            .from("assicurazioni_credito" as never)
            .update(payload as never)
            .eq("id", existId);
          if (error) {
            assicSkipped += 1;
            log.push(`Assic riga ${a.excelRow}: ${error.message}`);
          } else assicUpdated += 1;
        } else {
          const { error } = await supabase
            .from("assicurazioni_credito" as never)
            .insert(payload as never);
          if (error) {
            assicSkipped += 1;
            log.push(`Assic riga ${a.excelRow}: ${error.message}`);
          } else {
            assicCreated += 1;
            existingPol.set(cid, "new");
          }
        }
      }

      if (assicClients.size) {
        await supabase
          .from("clienti")
          .update({ assicurazione_attiva: true } as never)
          .in("id", Array.from(assicClients));
      }

      const summary = [
        `SCADENZIARIO: lette ${scadRead}, abbinati ${matchedClients.size} clienti, ${scadCreated} create, ${scadUpdated} aggiornate, ${scadSkipped} saltate`,
        `ASSICURAZIONI: lette ${assicRows.length}, ${assicCreated} create, ${assicUpdated} aggiornate, ${assicSkipped} saltate`,
        `Clienti bloccati: ${clientsToBlock.size}, pratiche legali create: ${clientsLegale.size}`,
      ];

      await supabase
        .from("importazioni")
        .update({
          righe_elaborate: scadRows.length + assicRows.length,
          righe_create: scadCreated + assicCreated,
          righe_aggiornate: scadUpdated + assicUpdated,
          righe_errore: scadSkipped + assicSkipped,
          stato: scadSkipped + assicSkipped > 0 ? "completata_con_errori" : "completata",
          completata_at: new Date().toISOString(),
          log_errori: log.length ? log.slice(0, 300).map((m) => ({ messaggio: m })) : null,
        })
        .eq("id", imp!.id);

      return { log: [...summary, ...log] };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success("Import scadenziario+assicurazioni completato");
      qc.invalidateQueries({ queryKey: ["clienti"] });
      qc.invalidateQueries({ queryKey: ["scadenze"] });
      qc.invalidateQueries({ queryKey: ["assicurazioni"] });
      qc.invalidateQueries({ queryKey: ["pratiche_legali"] });
      qc.invalidateQueries({ queryKey: ["solleciti"] });
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <ShieldCheck className="size-4" /> C · Importa Scadenziario e Assicurazioni
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        File Excel con due fogli: <code>SCADENZIARIO</code> (intestazioni riga 11, struttura a
        blocchi cliente) e <code>ASSICURAZIONE</code> (intestazioni riga 1). Match cliente per{" "}
        <code>codice_gestionale</code>. Crea solleciti, pratiche legali e blocchi automatici.
      </p>
      {!fileName ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Trascina il file qui o clicca per selezionare</p>
          <p className="text-xs text-muted-foreground mt-1">
            .xlsx con fogli SCADENZIARIO + ASSICURAZIONE
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {parsing && <Loader2 className="size-4 animate-spin mx-auto mt-3" />}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="size-4 shrink-0" />
              <span className="text-sm truncate">{fileName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={reset}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="gap-1">
              <CalendarClock className="size-3" /> {scadRows.length} scadenze
            </Badge>
            <Badge variant="default" className="gap-1">
              <ShieldCheck className="size-3" /> {assicRows.length} polizze
            </Badge>
            {warnings.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="size-3" /> {warnings.length} avvisi
              </Badge>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-md border p-2 text-xs text-destructive space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
          {result && (
            <div className="rounded-md border p-3 bg-muted/30 space-y-1 max-h-60 overflow-auto">
              <p className="text-xs font-medium mb-1">Esito import</p>
              {result.log.slice(0, 100).map((m, i) => (
                <p key={i} className="text-xs font-mono text-muted-foreground">
                  {m}
                </p>
              ))}
            </div>
          )}
          <Button
            className="w-full gap-1.5"
            disabled={(!scadRows.length && !assicRows.length) || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Importa {scadRows.length} scadenze + {assicRows.length} polizze
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * D — BLOCCO FIDO E ASSICURAZIONE
 * ============================================================================ */

type BfaParsedRow = {
  cod_cli: string;
  ind_blocco: number | null;
  ultima_data_fatturazione: string | null;
  fido: number | null;
  assicurazione: number | null;
};
type BfaNoteRow = { cod_cli: string; nota: string };

function bfaClientToNum(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bfaClientDateISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) {
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    let yy = m1[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function parseBloccoFidoFile(
  file: File,
  log: (msg: string) => void = () => {},
): Promise<{
  rowsBlocco: BfaParsedRow[];
  rowsNote: BfaNoteRow[];
  foglioNotePresente: boolean;
  warnings: string[];
}> {
  log(`Lettura file ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)…`);
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: "array",
    cellFormula: false,
    cellStyles: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
    sheetStubs: false,
    bookDeps: false,
    bookFiles: false,
    bookProps: false,
    bookVBA: false,
  });
  log(`Fogli trovati: ${wb.SheetNames.join(", ")}`);

  const foglioBlocco =
    (wb.Sheets["BLOCCO_FIDO_ASSICURAZIONE"] ? "BLOCCO_FIDO_ASSICURAZIONE" : null) ??
    wb.SheetNames.find((n) => n.trim().toUpperCase() === "BLOCCO_FIDO_ASSICURAZIONE");
  if (!foglioBlocco) throw new Error("Foglio BLOCCO_FIDO_ASSICURAZIONE non trovato nel file");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[foglioBlocco], {
    header: 1,
    defval: "",
    blankrows: false,
  });
  log(`Foglio BLOCCO_FIDO_ASSICURAZIONE: ${Math.max(0, matrix.length - 1)} righe trovate`);
  if (!matrix.length) throw new Error("Foglio BLOCCO_FIDO_ASSICURAZIONE vuoto");

  const headers = (matrix[0] as unknown[]).map((h) => normalize(String(h ?? "")));
  const findH = (...cands: string[]) => {
    for (const c of cands) {
      const i = headers.indexOf(normalize(c));
      if (i !== -1) return i;
    }
    return -1;
  };
  const iCod = findH("cod_cli", "cod cli", "codcli");
  const iInd = findH("ind_blocco", "ind blocco");
  const iData = findH("ultima data fatturazione", "ultima_data_fatturazione");
  const iFido = findH("fido");
  const iAss = findH("assicurazione");
  if (iCod === -1) throw new Error("Colonna COD_CLI non trovata in BLOCCO_FIDO_ASSICURAZIONE");
  log(
    `Indici colonne: cod=${iCod} ind=${iInd} data=${iData} fido=${iFido} ass=${iAss}`,
  );

  const rowsBlocco: BfaParsedRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = (matrix[i] ?? []) as unknown[];
    const cod = String(r[iCod] ?? "").trim().replace(/\.0$/, "");
    if (!cod) continue;
    rowsBlocco.push({
      cod_cli: cod,
      ind_blocco:
        iInd >= 0
          ? bfaClientToNum(r[iInd]) != null
            ? Math.trunc(bfaClientToNum(r[iInd]) as number)
            : null
          : null,
      ultima_data_fatturazione: iData >= 0 ? bfaClientDateISO(r[iData]) : null,
      fido: iFido >= 0 ? bfaClientToNum(r[iFido]) : null,
      assicurazione: iAss >= 0 ? bfaClientToNum(r[iAss]) : null,
    });
  }
  log(`Righe valide BLOCCO_FIDO_ASSICURAZIONE: ${rowsBlocco.length}`);

  const warnings: string[] = [];
  const foglioNote =
    (wb.Sheets["Note Legale"] ? "Note Legale" : null) ??
    wb.SheetNames.find((n) => {
      const k = n.trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
      return k === "notelegale" || k === "notelegali";
    });
  const rowsNote: BfaNoteRow[] = [];
  if (!foglioNote) {
    warnings.push("Foglio 'Note Legale' non trovato — nessuna nota importata");
    log("Foglio 'Note Legale' NON trovato");
  } else {
    const nMatrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[foglioNote], {
      header: 1,
      defval: "",
      blankrows: false,
    });
    log(`Foglio Note Legale: ${Math.max(0, nMatrix.length - 1)} righe trovate`);
    if (nMatrix.length < 2) {
      warnings.push("Foglio 'Note Legale' vuoto — nessuna nota importata");
    } else {
      const nHeaders = (nMatrix[0] as unknown[]).map((h) => normalize(String(h ?? "")));
      const findNH = (...cands: string[]) => {
        for (const c of cands) {
          const i = nHeaders.indexOf(normalize(c));
          if (i !== -1) return i;
        }
        return -1;
      };
      const iCodN = findNH("cod_cli", "cod cli", "codcli");
      const iNota = findNH("note legale", "note legali", "nota legale", "nota");
      if (iCodN === -1 || iNota === -1) {
        warnings.push("Foglio 'Note Legale': colonne mancanti — nessuna nota importata");
        log(`Note Legale colonne mancanti (cod=${iCodN}, nota=${iNota})`);
      } else {
        const seen = new Map<string, string>();
        for (let i = 1; i < nMatrix.length; i++) {
          const r = (nMatrix[i] ?? []) as unknown[];
          const cod = String(r[iCodN] ?? "").trim().replace(/\.0$/, "");
          const nota = String(r[iNota] ?? "").trim();
          if (!cod || !nota) continue;
          seen.set(cod, nota);
        }
        for (const [cod_cli, nota] of seen) rowsNote.push({ cod_cli, nota });
        log(`Note legali uniche parsate: ${rowsNote.length}`);
      }
    }
  }

  return { rowsBlocco, rowsNote, foglioNotePresente: !!foglioNote, warnings };
}

function BloccoFidoAssicurazioneImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importazioneId, setImportazioneId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<"idle" | "parsing" | "uploading" | "triggering">("idle");

  const [logs, setLogs] = useState<string[]>([]);
  const pushLog = (m: string) => {
    const ts = new Date().toLocaleTimeString("it-IT");
    setLogs((prev) => [...prev, `[${ts}] ${m}`]);
  };

  function reset() {
    setFile(null);
    setImportazioneId(null);
    setDone(false);
    setPhase("idle");
    setLogs([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  const startMut = useMutation({
    mutationFn: async (f: File) => {
      setLogs([]);
      setPhase("parsing");
      const parsed = await parseBloccoFidoFile(f, pushLog);
      if (!parsed.rowsBlocco.length) throw new Error("Nessuna riga utile nel foglio BLOCCO_FIDO_ASSICURAZIONE");
      pushLog(
        `Riepilogo parsing: ${parsed.rowsBlocco.length} righe blocco, ${parsed.rowsNote.length} note legali`,
      );

      setPhase("uploading");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: imp, error: impErr } = await supabase
        .from("importazioni")
        .insert({
          nome_file: f.name,
          fonte: "blocco_fido_assicurazione",
          stato: "in_elaborazione",
          righe_totali: parsed.rowsBlocco.length,
          eseguita_da: user?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;
      pushLog(`Importazione creata id=${imp.id}`);

      const baseDir = `blocco-fido/${imp.id}`;
      const chunkSize = 500;
      const totalChunks = Math.ceil(parsed.rowsBlocco.length / chunkSize);

      const manifest = {
        kind: "blocco-fido-staging-v1",
        importazioneId: imp.id,
        nomeFile: f.name,
        totaleBlocco: parsed.rowsBlocco.length,
        totaleNote: parsed.rowsNote.length,
        foglioNotePresente: parsed.foglioNotePresente,
        chunkSize,
        totalChunks,
        warnings: parsed.warnings,
        createdAt: new Date().toISOString(),
      };

      const uploadJson = async (path: string, body: unknown) => {
        const { error } = await supabase.storage.from("import-files").upload(
          path,
          new Blob([JSON.stringify(body)], { type: "application/json" }),
          { contentType: "application/json", upsert: true },
        );
        if (error) throw error;
      };

      await uploadJson(`${baseDir}/manifest.json`, manifest);
      pushLog(`Manifest caricato (${totalChunks} chunk previsti, chunkSize=${chunkSize})`);

      // Upload SEQUENZIALE dei chunk BLOCCO_FIDO_ASSICURAZIONE con feedback per ciascuno
      pushLog(
        `BLOCCO_FIDO_ASSICURAZIONE: ${parsed.rowsBlocco.length} righe → ${totalChunks} chunk da ${chunkSize}`,
      );
      for (let i = 0; i < totalChunks; i++) {
        const slice = parsed.rowsBlocco.slice(i * chunkSize, (i + 1) * chunkSize);
        pushLog(`Chunk BLOCCO ${i + 1}/${totalChunks} in upload (${slice.length} righe)…`);
        await uploadJson(`${baseDir}/blocco-chunk-${i}.json`, slice);
        pushLog(`Chunk BLOCCO ${i + 1}/${totalChunks} ✓`);
      }
      pushLog(`Tutti i ${totalChunks} chunk BLOCCO caricati su Storage`);

      // Upload Note Legale (unico file)
      pushLog(`Note Legale: ${parsed.rowsNote.length} righe, upload in corso…`);
      await uploadJson(`${baseDir}/note-legali.json`, parsed.rowsNote);
      pushLog(`note-legali.json ✓ (${parsed.rowsNote.length} note)`);

      await supabase
        .from("importazioni")
        .update({ file_path: `${baseDir}/manifest.json` })
        .eq("id", imp.id);

      setPhase("triggering");
      pushLog("Tutti i JSON caricati. Invio evento Inngest…");
      await triggerImport({
        data: {
          fonte: "blocco_fido_assicurazione",
          importazioneId: imp.id,
          filePath: `${baseDir}/manifest.json`,
        },
      });
      pushLog("Evento Inngest inviato. Elaborazione server in corso.");

      return imp.id;
    },
    onSuccess: (id) => {
      setImportazioneId(id);
      setDone(false);
      setPhase("idle");
      toast.success("Import avviato in background. Puoi chiudere la pagina, prosegue lato server.");
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => {
      setPhase("idle");
      pushLog(`ERRORE: ${e.message}`);
      toast.error(e.message);
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["importazione-stato", importazioneId],
    queryFn: async () => {
      if (!importazioneId) return null;
      const { data } = await supabase
        .from("importazioni")
        .select(
          "stato, righe_totali, righe_elaborate, righe_create, righe_aggiornate, righe_errore, righe_saltate, codici_mancanti, log_errori, report_saltati, completata_at",
        )
        .eq("id", importazioneId)
        .single();
      return data as BackgroundImportProgress | null;
    },
    enabled: !!importazioneId && !done,
    refetchInterval: 2000,
  });

  if (
    progress &&
    !done &&
    (progress.stato === "completata" || progress.stato === "completata_con_errori")
  ) {
    setDone(true);
    qc.invalidateQueries({ queryKey: ["clienti"] });
    qc.invalidateQueries({ queryKey: ["assicurazioni"] });
    qc.invalidateQueries({ queryKey: ["anomalie-import"] });
    qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    toast.success("Import completato");
  }

  const inProgress = !!importazioneId && !done;
  const isPending = startMut.isPending;

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <ShieldCheck className="size-4" /> D · Importa Blocco Fido, Assicurazione e Note Legali
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Il file Excel viene letto nel browser (solo i fogli{" "}
        <code>BLOCCO_FIDO_ASSICURAZIONE</code> e <code>Note Legale</code>) e caricato come JSON.
        Il server aggiorna blocchi, fido, polizza POUEY, flag <code>cliente_attivo</code>{" "}
        (fatturazione &ge; 01/01/2025) e note legali, registrando le anomalie da approvare.
      </p>

      {isPending && (
        <div className="mb-4 p-3 rounded-md border bg-muted/30 text-sm flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {phase === "parsing" && "Lettura file Excel nel browser…"}
          {phase === "uploading" && "Caricamento dati su Storage…"}
          {phase === "triggering" && "Avvio elaborazione server…"}
        </div>
      )}

      {(isPending || inProgress) && logs.length > 0 && (
        <div className="mb-4 p-3 rounded-md border bg-muted/20 text-xs font-mono max-h-48 overflow-y-auto space-y-0.5">
          {logs.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">{l}</div>
          ))}
        </div>
      )}

      {inProgress && progress && (
        <BgProgressBlock progress={progress} fallbackTotal={0} />
      )}

      {!file && !inProgress && !isPending ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
        >
          <FileSpreadsheet className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Trascina qui il file Excel oppure
          </p>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-1" /> Seleziona file
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
        </div>
      ) : null}

      {file && !inProgress && !isPending && !done && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> {file.name}
              <Badge variant="secondary">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
            </span>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="size-4" />
            </Button>
          </div>
          <Button
            className="w-full gap-1.5"
            disabled={isPending}
            onClick={() => startMut.mutate(file)}
          >
            Avvia import (parse + upload + background)
          </Button>
        </div>
      )}

      {done && progress && (() => {
        const logArr = Array.isArray(progress.log_errori)
          ? (progress.log_errori as Array<{ riga: number; errore: string }>)
          : [];
        const riepilogo = logArr.find((l) =>
          typeof l?.errore === "string" && l.errore.startsWith("Riepilogo:"),
        );
        const parseNum = (re: RegExp) => {
          const m = riepilogo?.errore.match(re);
          return m ? Number(m[1]) : null;
        };
        const aggiornati = parseNum(/(\d+)\s+aggiornati/);
        const azzerati = parseNum(/(\d+)\s+azzerati/);
        const anomalie = parseNum(/(\d+)\s+anomalie/);
        const nonTrovati = parseNum(/(\d+)\s+non\s+trovati/);
        const errori = parseNum(/(\d+)\s+errori/);
        const altri = logArr.filter((l) => l !== riepilogo);
        return (
          <div className="space-y-2 p-3 rounded-md border bg-muted/30 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4 text-success" /> Import completato
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Badge className="bg-success/15 text-success hover:bg-success/20">
                {aggiornati ?? progress.righe_aggiornate ?? 0} aggiornati
              </Badge>
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
                {azzerati ?? 0} azzerati
              </Badge>
              <Badge className="bg-orange-500/15 text-orange-700 hover:bg-orange-500/20">
                {anomalie ?? 0} anomalie in attesa
              </Badge>
              <Badge variant="secondary">
                {nonTrovati ?? progress.righe_saltate ?? 0} non trovati
              </Badge>
              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20">
                {errori ?? progress.righe_errore ?? 0} errori
              </Badge>
            </div>
            {(anomalie ?? 0) > 0 && (
              <a
                href="/import-export#anomalie"
                className="inline-block text-xs text-primary underline"
              >
                Vai al tab Anomalie →
              </a>
            )}
            {altri.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Log dettagli ({altri.length})
                </summary>
                <ul className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                  {altri.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      {e.riga ? `Riga ${e.riga}: ` : ""}{e.errore}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={reset}>
              Nuovo import
            </Button>
          </div>
        );
      })()}
    </Card>
  );
}



/* ============================================================================
 * EXPORT
 * ============================================================================ */

function ExportCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "clienti" | "richieste">(null);

  async function logEsportazione(nome_file: string, righe: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("esportazioni").insert({
      nome_file,
      righe_esportate: righe,
      eseguita_da: user?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ["storico-import-export"] });
  }

  async function exportClienti() {
    setBusy("clienti");
    try {
      const { data, error } = await supabase
        .from("clienti")
        .select(
          "ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, attivo, privacy_firmata, condizione_pagamento_cod, condizione_pagamento_desc, condizioni_pagamento, stores(codice, nome)",
        )
        .order("ragione_sociale");
      if (error) throw error;
      const flat = (data ?? []).map((c: any) => ({
        ragione_sociale: c.ragione_sociale,
        partita_iva: c.partita_iva,
        codice_fiscale: c.codice_fiscale,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap,
        provincia: c.provincia,
        telefono: c.telefono,
        email: c.email,
        "Cod. pagamento": c.condizione_pagamento_cod ?? "",
        "Desc. pagamento": c.condizione_pagamento_desc ?? c.condizioni_pagamento ?? "",
        store_codice: (c.stores as { codice: string } | null)?.codice ?? "",
        store_nome: (c.stores as { nome: string } | null)?.nome ?? "",
        attivo: c.attivo ? "Sì" : "No",
        privacy_firmata: c.privacy_firmata ? "Sì" : "No",
      }));
      const fname = `clienti_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clienti");
      XLSX.writeFile(wb, fname);
      await logEsportazione(fname, flat.length);
      toast.success(`Esportati ${flat.length} clienti`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore export");
    } finally {
      setBusy(null);
    }
  }

  async function exportRichieste() {
    setBusy("richieste");
    try {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select(
          "tipo, importo_richiesto, importo_approvato, durata_mesi, stato, livello_richiesto, livello_corrente, data_invio, data_chiusura, data_scadenza, motivazione, clienti(ragione_sociale, partita_iva), stores(codice, nome)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const flat = (data ?? []).map((r) => ({
        cliente: (r.clienti as { ragione_sociale: string } | null)?.ragione_sociale ?? "",
        partita_iva: (r.clienti as { partita_iva: string | null } | null)?.partita_iva ?? "",
        store: (r.stores as { codice: string } | null)?.codice ?? "",
        tipo: r.tipo,
        stato: r.stato,
        importo_richiesto: r.importo_richiesto,
        importo_approvato: r.importo_approvato,
        durata_mesi: r.durata_mesi,
        livello_richiesto: r.livello_richiesto,
        livello_corrente: r.livello_corrente,
        data_invio: r.data_invio,
        data_chiusura: r.data_chiusura,
        data_scadenza: r.data_scadenza,
        motivazione: r.motivazione,
      }));
      const fname = `richieste_fido_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Richieste fido");
      XLSX.writeFile(wb, fname);
      await logEsportazione(fname, flat.length);
      toast.success(`Esportate ${flat.length} richieste`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore export");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <Download className="size-4" /> Export dati
      </h2>
      <p className="text-xs text-muted-foreground mb-4">Scarica i dati in formato Excel (.xlsx).</p>
      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={busy !== null}
          onClick={exportClienti}
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" /> Anagrafica clienti
          </span>
          {busy === "clienti" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={busy !== null}
          onClick={exportRichieste}
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" /> Richieste fido
          </span>
          {busy === "richieste" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
        </Button>
      </div>
    </Card>
  );
}

/* ============================================================================
 * HISTORY
 * ============================================================================ */

function HistoryCard({ kind }: { kind: "importazioni" | "esportazioni" }) {
  type HistoryRow = {
    id: string;
    nome_file?: string | null;
    fonte?: string | null;
    stato?: string | null;
    created_at: string;
    righe_totali?: number | null;
    righe_elaborate?: number | null;
    righe_create?: number | null;
    righe_aggiornate?: number | null;
    righe_errore?: number | null;
    righe_esportate?: number | null;
  };
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["storico-import-export", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(kind)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const rows = (q.state.data as Array<{ stato?: string }> | undefined) ?? [];
      return rows.some((r) => r.stato === "in_elaborazione") ? 3000 : false;
    },
  });

  const isBloccato = (imp: HistoryRow): boolean => {
    if (imp.stato !== "in_elaborazione") return false;
    const updated = new Date((imp as { updated_at?: string }).updated_at ?? imp.created_at);
    const diffMinuti = (Date.now() - updated.getTime()) / 1000 / 60;
    return diffMinuti > 60;
  };

  const title = kind === "importazioni" ? "Ultime importazioni" : "Ultime esportazioni";
  const Icon = kind === "importazioni" ? Upload : Download;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Icon className="size-4" /> {title}
        </h2>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <Loader2 className={`size-3 mr-1 ${isFetching ? "animate-spin" : "hidden"}`} />
          Aggiorna
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna operazione registrata.</p>
      ) : (
        <div className="space-y-3">
          {(data as HistoryRow[]).map((r) => {
            const totali = Number(r.righe_totali ?? 0);
            const elaborate = Number(r.righe_elaborate ?? 0);
            const pct =
              totali > 0
                ? Math.min(100, Math.round((elaborate / totali) * 100))
                : r.stato === "in_elaborazione"
                  ? 0
                  : 100;
            const inCorso = r.stato === "in_elaborazione";
            const bloccato = kind === "importazioni" && isBloccato(r);
            const variant =
              bloccato
                ? "destructive"
                : r.stato === "completata"
                  ? "default"
                  : r.stato === "fallita"
                    ? "destructive"
                    : r.stato === "completata_con_errori"
                      ? "secondary"
                      : "outline";
            return (
              <div key={r.id} className="border-b last:border-0 pb-3 last:pb-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.nome_file}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.fonte ? <span className="mr-2">[{r.fonte}]</span> : null}
                      {new Date(r.created_at).toLocaleString("it-IT")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge
                      variant={variant as "default" | "destructive" | "secondary" | "outline"}
                      className="gap-1"
                    >
                      {inCorso && !bloccato ? <Loader2 className="size-3 animate-spin" /> : null}
                      {bloccato ? "Bloccato" : r.stato}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kind === "importazioni"
                        ? `${r.righe_create ?? 0} nuovi · ${r.righe_aggiornate ?? 0} agg. / ${r.righe_totali ?? 0}`
                        : `${r.righe_esportate ?? 0} righe`}
                    </p>
                    {bloccato ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 mt-1 text-[11px] px-2"
                        onClick={async () => {
                          await supabase
                            .from("importazioni")
                            .update({
                              stato: "completata_con_errori",
                              completata_at: new Date().toISOString(),
                              log_errori:
                                "Import interrotto: nessun aggiornamento da oltre 60 minuti.",
                            })
                            .eq("id", r.id);
                          queryClient.invalidateQueries({
                            queryKey: ["storico-import-export", "importazioni"],
                          });
                          toast.info("Import marcato come fallito");
                        }}
                      >
                        Segna come fallito
                      </Button>
                    ) : null}
                  </div>
                </div>
                {kind === "importazioni" && (inCorso || (totali > 0 && elaborate < totali)) ? (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${inCorso ? "bg-primary" : "bg-secondary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {elaborate}/{totali || "?"} righe ({pct}%)
                      {r.righe_errore ? (
                        <span className="text-destructive ml-2">· {r.righe_errore} errori</span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
