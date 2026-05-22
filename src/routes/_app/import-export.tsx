import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, X, FileDown, Loader2, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/import-export")({
  component: ImportExportPage,
});

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
): Array<Record<string, unknown> & { __row: number }> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  const kw = normalize(headerKeyword);
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (row.some((c) => {
      const n = normalize(String(c ?? ""));
      return n === kw || n.startsWith(kw + " ");
    })) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  // Skip description row right after headers (per template convention).
  const dataStart = headerIdx + 2;
  const out: Array<Record<string, unknown> & { __row: number }> = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => { if (h) obj[h] = row[j] ?? ""; });
    out.push(Object.assign(obj, { __row: i + 1 }));
  }
  return out;
}

function ImportExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importa anagrafiche o dati di rischio da Excel ed esporta i dati per analisi.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnagraficaImportCard />
        <RischioImportCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExportCard />
        <HistoryCard kind="importazioni" />
      </div>
    </div>
  );
}

/* ============================================================================
 * A — ANAGRAFICA
 * ============================================================================ */

const anagraficaSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Ragione sociale obbligatoria").max(200),
  codice_gestionale: z.string().trim().max(50).optional(),
  partita_iva: z.string().trim().max(20).optional(),
  codice_fiscale: z.string().trim().max(20).optional(),
  forma_giuridica: z.string().trim().max(100).optional(),
  indirizzo: z.string().trim().max(200).optional(),
  citta: z.string().trim().max(100).optional(),
  cap: z.string().trim().max(10).optional(),
  provincia: z.string().trim().max(5).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  pec: z.string().trim().max(255).optional(),
  codice_sdi: z.string().trim().max(20).optional(),
  store_codice: z.string().trim().max(50).optional(),
  note: z.string().trim().max(1000).optional(),
});
type AnagraficaRow = z.infer<typeof anagraficaSchema>;

const ANAG_HEADERS: Record<string, keyof AnagraficaRow> = {
  "ragione sociale": "ragione_sociale", "ragionesociale": "ragione_sociale", "denominazione": "ragione_sociale",
  "codice gestionale": "codice_gestionale", "codice": "codice_gestionale", "cod gestionale": "codice_gestionale",
  "partita iva": "partita_iva", "p iva": "partita_iva", "piva": "partita_iva",
  "codice fiscale": "codice_fiscale", "cf": "codice_fiscale",
  "forma giuridica": "forma_giuridica",
  "indirizzo": "indirizzo", "via": "indirizzo",
  "citta": "citta", "città": "citta",
  "cap": "cap",
  "provincia": "provincia", "prov": "provincia",
  "telefono": "telefono", "tel": "telefono",
  "email": "email", "e mail": "email", "mail": "email",
  "pec": "pec",
  "codice sdi": "codice_sdi", "sdi": "codice_sdi",
  "store codice": "store_codice", "store": "store_codice", "punto vendita": "store_codice",
  "note": "note",
};

type ParsedRow<T> = { idx: number; data: T; errors: string[] };

function AnagraficaImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow<AnagraficaRow>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<null | { created: number; updated: number; skipped: number; errors: Array<{ riga: number; errore: string }> }>(null);

  function reset() {
    setFileName(null); setRows([]); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParsing(true); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = sheetToObjects(sheet, "codice");
      if (!raw.length) { toast.error("Nessuna riga dati trovata (intestazione 'Codice' mancante o file vuoto)"); return; }
      const parsed: ParsedRow<AnagraficaRow>[] = raw.map((r) => {
        const mapped: Record<string, string> = {};
        for (const k of Object.keys(r)) {
          if (k === "__row") continue;
          const f = ANAG_HEADERS[normalize(k)];
          if (f) mapped[f] = String(r[k] ?? "").trim();
        }
        const res = anagraficaSchema.safeParse(mapped);
        return {
          idx: r.__row,
          data: (res.success ? res.data : mapped) as AnagraficaRow,
          errors: res.success ? [] : res.error.issues.map((e) => `${e.path[0]}: ${e.message}`),
        };
      });
      setFileName(file.name);
      setRows(parsed);
      toast.success(`${parsed.length} righe lette`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore lettura file");
    } finally {
      setParsing(false);
    }
  }

  const valid = rows.filter((r) => r.errors.length === 0 && r.data.ragione_sociale);
  const invalid = rows.filter((r) => r.errors.length > 0);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!valid.length) throw new Error("Nessuna riga valida");
      const { data: { user } } = await supabase.auth.getUser();

      // Cache stores per codice
      const codStores = Array.from(new Set(valid.map((r) => r.data.store_codice).filter((v): v is string => !!v)));
      const storeMap = new Map<string, string>();
      if (codStores.length) {
        const { data } = await supabase.from("stores").select("id, codice").in("codice", codStores);
        (data ?? []).forEach((s) => storeMap.set(s.codice, s.id));
      }

      const { data: imp, error: impErr } = await supabase.from("importazioni").insert({
        nome_file: fileName ?? "anagrafica.xlsx",
        righe_totali: rows.length,
        righe_errore: invalid.length,
        stato: "in_elaborazione",
        fonte: "anagrafica",
        eseguita_da: user?.id ?? null,
      }).select("id").single();
      if (impErr) throw impErr;

      // Lookup esistenti per codice_gestionale o partita_iva
      const codici = Array.from(new Set(valid.map((r) => r.data.codice_gestionale).filter((v): v is string => !!v)));
      const pive = Array.from(new Set(valid.map((r) => r.data.partita_iva).filter((v): v is string => !!v)));
      const existing = new Map<string, string>();
      if (codici.length) {
        const { data } = await supabase.from("clienti").select("id, codice_gestionale").in("codice_gestionale", codici);
        (data ?? []).forEach((c) => { if (c.codice_gestionale) existing.set(`cg:${c.codice_gestionale}`, c.id); });
      }
      if (pive.length) {
        const { data } = await supabase.from("clienti").select("id, partita_iva").in("partita_iva", pive);
        (data ?? []).forEach((c) => { if (c.partita_iva) existing.set(`pi:${c.partita_iva}`, c.id); });
      }

      let created = 0, updated = 0;
      const errorLog: Array<{ riga: number; errore: string }> = [];

      for (const r of valid) {
        const d = r.data;
        const storeId = d.store_codice ? storeMap.get(d.store_codice) ?? null : null;
        if (d.store_codice && !storeId) {
          errorLog.push({ riga: r.idx, errore: `Store '${d.store_codice}' non trovato` });
          continue;
        }
        const payload: Record<string, unknown> = {
          ragione_sociale: d.ragione_sociale,
          codice_gestionale: toStr(d.codice_gestionale),
          partita_iva: toStr(d.partita_iva),
          codice_fiscale: toStr(d.codice_fiscale),
          tipo_soggetto: toStr(d.forma_giuridica),
          indirizzo: toStr(d.indirizzo),
          citta: toStr(d.citta),
          cap: toStr(d.cap),
          provincia: toStr(d.provincia),
          telefono: toStr(d.telefono),
          email: toStr(d.email),
          pec: toStr(d.pec),
          codice_sdi: toStr(d.codice_sdi),
          note: toStr(d.note),
        };
        if (storeId) payload.store_id = storeId;

        const existId =
          (d.codice_gestionale && existing.get(`cg:${d.codice_gestionale}`)) ||
          (d.partita_iva && existing.get(`pi:${d.partita_iva}`)) || null;

        if (existId) {
          const { error } = await supabase.from("clienti").update(payload as never).eq("id", existId);
          if (error) errorLog.push({ riga: r.idx, errore: `Update: ${error.message}` });
          else updated += 1;
        } else {
          const { data, error } = await supabase.from("clienti").insert(payload as never).select("id, codice_gestionale, partita_iva").single();
          if (error) errorLog.push({ riga: r.idx, errore: `Insert: ${error.message}` });
          else {
            created += 1;
            if (data?.codice_gestionale) existing.set(`cg:${data.codice_gestionale}`, data.id);
            if (data?.partita_iva) existing.set(`pi:${data.partita_iva}`, data.id);
          }
        }
      }

      const skipped = invalid.length;
      const fullLog = [
        ...invalid.slice(0, 100).map((r) => ({ riga: r.idx, errore: r.errors.join("; ") })),
        ...errorLog,
      ];
      await supabase.from("importazioni").update({
        righe_elaborate: valid.length,
        righe_create: created,
        righe_aggiornate: updated,
        righe_errore: skipped + errorLog.length,
        stato: (skipped + errorLog.length) > 0 ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        log_errori: fullLog.length ? fullLog : null,
      }).eq("id", imp.id);

      return { created, updated, skipped, errors: errorLog };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Anagrafica: ${r.created} creati, ${r.updated} aggiornati, ${r.skipped + r.errors.length} saltati`);
      qc.invalidateQueries({ queryKey: ["clienti"] });
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{
      codice_gestionale: "13908", ragione_sociale: "Esempio S.r.l.",
      partita_iva: "12345678901", codice_fiscale: "12345678901",
      forma_giuridica: "azienda",
      indirizzo: "Via Roma 1", citta: "Milano", cap: "20100", provincia: "MI",
      telefono: "+39 02 1234567", email: "info@esempio.it", pec: "esempio@pec.it",
      codice_sdi: "0000000", store_codice: "", note: "",
    }]);
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
        Crea o aggiorna i clienti (upsert su <code>codice_gestionale</code> o <code>partita_iva</code>).
      </p>
      <ImportZone
        fileName={fileName} parsing={parsing} dragOver={dragOver}
        setDragOver={setDragOver} fileRef={fileRef} onFile={handleFile} onReset={reset}
        valid={valid.length} invalid={invalid}
        result={result}
        action={
          <Button className="w-full gap-1.5" disabled={!valid.length || importMut.isPending} onClick={() => importMut.mutate()}>
            {importMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Importa {valid.length} righe
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
  "codice": "codice_gestionale",
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
  "fido": "fido_gestionale",
  "fido azienda": "fido_gestionale",
  "fido concesso": "fido_gestionale",
  "fido gestionale": "fido_gestionale",
  "totale rischio": "totale_rischio",
  "tot rischio": "totale_rischio",
  "fido residuo": "fido_residuo",
  "residuo": "fido_residuo",
  "scaduto": "scaduto",
  "a scadere": "a_scadere",
  "num insoluti": "num_insoluti",
  "n insoluti": "num_insoluti",
  "insoluti": "num_insoluti",
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
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RischioRow[]>([]);
  const [missingCode, setMissingCode] = useState<number[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<null | { updated: number; skipped: number; errors: Array<{ riga: number; errore: string }> }>(null);

  function reset() {
    setFileName(null); setRows([]); setMissingCode([]); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParsing(true); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = sheetToObjects(sheet, "codice");
      if (!raw.length) { toast.error("Nessuna riga dati trovata (intestazione 'Codice' mancante o file vuoto)"); return; }

      const numFields = new Set([
        "saldo_contabile", "doc_da_fatturare", "doc_da_evadere", "effetti_a_rischio",
        "fido_gestionale", "totale_rischio", "fido_residuo", "scaduto", "a_scadere",
      ]);
      const intFields = new Set(["num_insoluti", "dilazione_concordata", "dilazione_effettiva"]);

      const parsed: RischioRow[] = [];
      const missing: number[] = [];
      const unknownHeaders = new Set<string>();
      raw.forEach((r) => {
        const mapped: Record<string, unknown> = {};
        for (const k of Object.keys(r)) {
          if (k === "__row") continue;
          const f = RISCHIO_HEADERS[normalize(k)];
          if (f) mapped[f] = r[k];
          else if (String(k).trim()) unknownHeaders.add(k);
        }
        const codice = toStr(mapped.codice_gestionale);
        if (!codice) { missing.push(r.__row); return; }
        const payload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(mapped)) {
          if (k === "codice_gestionale" || k === "ragione_sociale") continue;
          if (numFields.has(k)) payload[k] = toNum(v);
          else if (intFields.has(k)) payload[k] = toInt(v);
          else payload[k] = toStr(v);
        }
        parsed.push({
          idx: r.__row,
          codice_gestionale: codice,
          ragione_sociale: toStr(mapped.ragione_sociale) ?? "",
          payload,
        });
      });
      setFileName(file.name);
      setRows(parsed);
      setMissingCode(missing);
      if (unknownHeaders.size) {
        console.warn("[import-rischio] colonne ignorate:", Array.from(unknownHeaders));
        toast.warning(`Colonne ignorate: ${Array.from(unknownHeaders).join(", ")}`);
      }
      toast.success(`${parsed.length} righe lette${missing.length ? `, ${missing.length} senza codice` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore lettura file");
    } finally {
      setParsing(false);
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!rows.length) throw new Error("Nessuna riga valida");
      const { data: { user } } = await supabase.auth.getUser();

      const { data: imp, error: impErr } = await supabase.from("importazioni").insert({
        nome_file: fileName ?? "rischio.xlsx",
        righe_totali: rows.length + missingCode.length,
        righe_errore: missingCode.length,
        stato: "in_elaborazione",
        fonte: "analisi_rischio",
        eseguita_da: user?.id ?? null,
      }).select("id").single();
      if (impErr) throw impErr;

      // Lookup esistenti
      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      const map = new Map<string, string>();
      if (codici.length) {
        const { data } = await supabase.from("clienti").select("id, codice_gestionale").in("codice_gestionale", codici);
        (data ?? []).forEach((c) => { if (c.codice_gestionale) map.set(c.codice_gestionale, c.id); });
      }

      let updated = 0;
      const errorLog: Array<{ riga: number; errore: string }> = [
        ...missingCode.map((idx) => ({ riga: idx, errore: "Codice gestionale mancante" })),
      ];
      const now = new Date().toISOString();

      for (const r of rows) {
        const id = map.get(r.codice_gestionale);
        if (!id) {
          errorLog.push({ riga: r.idx, errore: `Codice ${r.codice_gestionale} non trovato${r.ragione_sociale ? ` (${r.ragione_sociale})` : ""}` });
          continue;
        }
        const { error } = await supabase.from("clienti")
          .update({ ...r.payload, ultima_sincronizzazione: now } as never)
          .eq("id", id);
        if (error) errorLog.push({ riga: r.idx, errore: `Update: ${error.message}` });
        else updated += 1;
      }

      const skipped = errorLog.length;
      await supabase.from("importazioni").update({
        righe_elaborate: rows.length,
        righe_create: 0,
        righe_aggiornate: updated,
        righe_errore: skipped,
        stato: skipped > 0 ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        log_errori: skipped ? errorLog.slice(0, 200) : null,
      }).eq("id", imp.id);

      return { updated, skipped, errors: errorLog };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Rischio: ${r.updated} aggiornati, ${r.skipped} saltati`);
      qc.invalidateQueries({ queryKey: ["clienti"] });
      qc.invalidateQueries({ queryKey: ["cliente"] });
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{
      "Codice": "13908", "Ragione sociale": "Esempio S.r.l.",
      "Cod.pag.": "RB22", "Descr.cod.pag.": "R.B. 60 gg. d.f. f.m.",
      "Saldo contab.": 1500, "Doc. da fatt.": 500, "Doc. da evad.": 0, "Eff. a rischio": 0,
      "Fido": 50000, "Totale rischio": 32000, "Fido residuo": 18000,
      "Scaduto": 0, "A scadere": 32000, "Num.insoluti": 0,
      "Dilaz.azienda": 60, "Dilaz.effettiva": 65,
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analisi rischio");
    XLSX.writeFile(wb, "template_analisi_rischio.xlsx");
  }

  const invalidParsed = missingCode.map((i) => ({ idx: i, errors: ["Codice mancante"] }));

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
        Aggiorna dati rischio dei clienti esistenti (match su <code>Codice</code>). Le righe senza match vengono saltate.
      </p>
      <ImportZone
        fileName={fileName} parsing={parsing} dragOver={dragOver}
        setDragOver={setDragOver} fileRef={fileRef} onFile={handleFile} onReset={reset}
        valid={rows.length} invalid={invalidParsed}
        result={result ? { created: 0, updated: result.updated, skipped: result.skipped, errors: result.errors } : null}
        action={
          <Button className="w-full gap-1.5" disabled={!rows.length || importMut.isPending} onClick={() => importMut.mutate()}>
            {importMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Aggiorna {rows.length} clienti
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
  result: null | { created: number; updated: number; skipped: number; errors: Array<{ riga: number; errore: string }> };
  action: React.ReactNode;
}) {
  const { fileName, parsing, dragOver, setDragOver, fileRef, onFile, onReset, valid, invalid, result, action } = props;
  if (!fileName) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Trascina il file qui o clicca per selezionare</p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
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
        <Button variant="ghost" size="icon" onClick={onReset}><X className="size-4" /></Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Badge variant="default" className="gap-1"><CheckCircle2 className="size-3" /> {valid} valide</Badge>
        {invalid.length > 0 && (
          <Badge variant="destructive" className="gap-1"><AlertCircle className="size-3" /> {invalid.length} errori</Badge>
        )}
      </div>
      {invalid.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead className="w-16">Riga</TableHead><TableHead>Errori</TableHead></TableRow></TableHeader>
            <TableBody>
              {invalid.slice(0, 50).map((r) => (
                <TableRow key={r.idx}>
                  <TableCell className="font-mono text-xs">{r.idx}</TableCell>
                  <TableCell className="text-xs text-destructive">{r.errors.join("; ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                <p key={i}><span className="font-mono">Riga {e.riga}:</span> {e.errore}</p>
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
 * EXPORT
 * ============================================================================ */

function ExportCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "clienti" | "richieste">(null);

  async function logEsportazione(nome_file: string, righe: number) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("esportazioni").insert({
      nome_file, righe_esportate: righe, eseguita_da: user?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ["storico-import-export"] });
  }

  async function exportClienti() {
    setBusy("clienti");
    try {
      const { data, error } = await supabase
        .from("clienti")
        .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, attivo, privacy_firmata, stores(codice, nome)")
        .order("ragione_sociale");
      if (error) throw error;
      const flat = (data ?? []).map((c) => ({
        ragione_sociale: c.ragione_sociale, partita_iva: c.partita_iva, codice_fiscale: c.codice_fiscale,
        indirizzo: c.indirizzo, citta: c.citta, cap: c.cap, provincia: c.provincia,
        telefono: c.telefono, email: c.email,
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
    } finally { setBusy(null); }
  }

  async function exportRichieste() {
    setBusy("richieste");
    try {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("tipo, importo_richiesto, importo_approvato, durata_mesi, stato, livello_richiesto, livello_corrente, data_invio, data_chiusura, data_scadenza, motivazione, clienti(ragione_sociale, partita_iva), stores(codice, nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const flat = (data ?? []).map((r) => ({
        cliente: (r.clienti as { ragione_sociale: string } | null)?.ragione_sociale ?? "",
        partita_iva: (r.clienti as { partita_iva: string | null } | null)?.partita_iva ?? "",
        store: (r.stores as { codice: string } | null)?.codice ?? "",
        tipo: r.tipo, stato: r.stato,
        importo_richiesto: r.importo_richiesto, importo_approvato: r.importo_approvato,
        durata_mesi: r.durata_mesi, livello_richiesto: r.livello_richiesto, livello_corrente: r.livello_corrente,
        data_invio: r.data_invio, data_chiusura: r.data_chiusura, data_scadenza: r.data_scadenza,
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
    } finally { setBusy(null); }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <Download className="size-4" /> Export dati
      </h2>
      <p className="text-xs text-muted-foreground mb-4">Scarica i dati in formato Excel (.xlsx).</p>
      <div className="space-y-3">
        <Button variant="outline" className="w-full justify-between" disabled={busy !== null} onClick={exportClienti}>
          <span className="flex items-center gap-2"><FileSpreadsheet className="size-4" /> Anagrafica clienti</span>
          {busy === "clienti" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
        <Button variant="outline" className="w-full justify-between" disabled={busy !== null} onClick={exportRichieste}>
          <span className="flex items-center gap-2"><FileSpreadsheet className="size-4" /> Richieste fido</span>
          {busy === "richieste" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      </div>
    </Card>
  );
}

/* ============================================================================
 * HISTORY
 * ============================================================================ */

function HistoryCard({ kind }: { kind: "importazioni" | "esportazioni" }) {
  const { data, isLoading } = useQuery({
    queryKey: ["storico-import-export", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from(kind).select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });

  const title = kind === "importazioni" ? "Ultime importazioni" : "Ultime esportazioni";
  const Icon = kind === "importazioni" ? Upload : Download;

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-3"><Icon className="size-4" /> {title}</h2>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna operazione registrata.</p>
      ) : (
        <div className="space-y-2">
          {data.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.nome_file}</p>
                <p className="text-xs text-muted-foreground">
                  {r.fonte ? <span className="mr-2">[{r.fonte}]</span> : null}
                  {new Date(r.created_at).toLocaleString("it-IT")}
                </p>
              </div>
              <div className="text-right shrink-0">
                {kind === "importazioni" ? (
                  <>
                    <Badge variant={r.stato === "completata" ? "default" : r.stato === "fallita" ? "destructive" : "secondary"}>
                      {r.stato}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.righe_create ?? 0} nuovi · {r.righe_aggiornate ?? 0} agg. / {r.righe_totali ?? 0}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{r.righe_esportate ?? 0} righe</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
