import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TARGET_FIELDS = [
  { key: "cod_gamma", label: "Cod. GAMMA" },
  { key: "cod_fornitore", label: "Cod. Fornitore" },
  { key: "descrizione", label: "Descrizione" },
  { key: "um", label: "U.M." },
  { key: "categoria", label: "Categoria" },
  { key: "tipologia", label: "Tipologia" },
  { key: "componente", label: "Componente" },
  { key: "peso_unit", label: "Peso unitario" },
  { key: "qta_cliente", label: "Q.tà cliente" },
  { key: "qta_fornitore", label: "Q.tà fornitore" },
  { key: "note", label: "Note" },
  { key: "stato", label: "Stato (attivo/potenziale)" },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

function guessMapping(header: string): TargetKey | "" {
  const h = header.toLowerCase().replace(/[\s._-]/g, "");
  if (h.includes("gamma")) return "cod_gamma";
  if (h.includes("codforn") || h.includes("codicefornitore")) return "cod_fornitore";
  if (h.includes("descr")) return "descrizione";
  if (h === "um" || h.includes("unitamis") || h.includes("misura")) return "um";
  if (h.includes("categ")) return "categoria";
  if (h.includes("tipol")) return "tipologia";
  if (h.includes("compon")) return "componente";
  if (h.includes("peso")) return "peso_unit";
  if (h.includes("qtacli") || h.includes("qtàcli")) return "qta_cliente";
  if (h.includes("qtafor") || h.includes("qtàfor")) return "qta_fornitore";
  if (h.includes("note")) return "note";
  if (h.includes("stato")) return "stato";
  return "";
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function ImportArticoliDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onDone: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey | "">>({});
  const [importing, setImporting] = useState(false);

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!json.length) {
        toast.error("File vuoto");
        return;
      }
      const hdrs = Object.keys(json[0]);
      const m: Record<string, TargetKey | ""> = {};
      for (const h of hdrs) m[h] = guessMapping(h);
      setHeaders(hdrs);
      setRows(json);
      setMapping(m);
    } catch (e) {
      console.error(e);
      toast.error("Impossibile leggere il file");
    }
  }

  async function doImport() {
    const mapEntries = Object.entries(mapping).filter(([, t]) => t) as [string, TargetKey][];
    if (!mapEntries.find(([, t]) => t === "cod_gamma")) {
      toast.error("Devi mappare la colonna Cod. GAMMA");
      return;
    }
    if (!mapEntries.find(([, t]) => t === "descrizione")) {
      toast.error("Devi mappare la colonna Descrizione");
      return;
    }

    setImporting(true);
    try {
      const payload = rows
        .map((r) => {
          const obj: Record<string, unknown> = {};
          for (const [src, tgt] of mapEntries) {
            const v = r[src];
            if (tgt === "peso_unit" || tgt === "qta_cliente" || tgt === "qta_fornitore") {
              obj[tgt] = toNumber(v);
            } else if (tgt === "stato") {
              const s = String(v ?? "").toLowerCase().trim();
              obj[tgt] = s === "attivo" || s === "potenziale" ? s : "potenziale";
            } else {
              const s = v === null || v === undefined ? "" : String(v).trim();
              obj[tgt] = s || null;
            }
          }
          return obj;
        })
        .filter((o) => o.cod_gamma && o.descrizione);

      if (!payload.length) {
        toast.error("Nessuna riga valida da importare");
        setImporting(false);
        return;
      }

      // Upsert on cod_gamma in chunks
      let ok = 0;
      const CHUNK = 200;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("articoli")
          .upsert(slice as never, { onConflict: "cod_gamma" });
        if (error) throw error;
        ok += slice.length;
      }
      toast.success(`Importati ${ok} articoli`);
      reset();
      onOpenChange(false);
      onDone();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Errore import";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(b) => {
        if (!b) reset();
        onOpenChange(b);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importa da GAMMA
          </DialogTitle>
          <DialogDescription>
            Carica un file Excel (.xlsx) o CSV. Le colonne verranno mappate sui campi articolo. L'import fa upsert sul Cod. GAMMA.
          </DialogDescription>
        </DialogHeader>

        {!headers.length ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 p-12 text-center text-sm text-muted-foreground hover:bg-muted/50">
            <Upload className="h-8 w-8" />
            <span>Clicca per scegliere un file (.xlsx, .xls, .csv)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded bg-muted/50 px-3 py-2 text-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span>
                {rows.length} righe rilevate. Mappa ogni colonna del file al campo articolo corrispondente.
              </span>
            </div>

            <div className="max-h-[40vh] overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Colonna file</th>
                    <th className="px-3 py-2 text-left">Anteprima</th>
                    <th className="px-3 py-2 text-left">Campo articolo</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{h}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {String(rows[0]?.[h] ?? "").slice(0, 40)}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping[h] || "__none"}
                          onValueChange={(v) =>
                            setMapping((m) => ({ ...m, [h]: v === "__none" ? "" : (v as TargetKey) }))
                          }
                        >
                          <SelectTrigger className="h-8 w-56">
                            <SelectValue placeholder="— ignora —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— ignora —</SelectItem>
                            {TARGET_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {headers.length > 0 && (
            <Button variant="outline" onClick={reset} disabled={importing}>
              Cambia file
            </Button>
          )}
          <Button onClick={doImport} disabled={!headers.length || importing}>
            {importing ? "Import in corso…" : "Conferma import"}
          </Button>
        </DialogFooter>
        <Label className="sr-only">x</Label>
      </DialogContent>
    </Dialog>
  );
}
