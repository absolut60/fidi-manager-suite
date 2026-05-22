import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, X, FileDown, Loader2,
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

// Schema riga import — tutti i campi opzionali tranne ragione_sociale
const rowSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Ragione sociale obbligatoria").max(200),
  codice_gestionale: z.string().trim().max(50).optional().or(z.literal("")),
  fido: z.coerce.number().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Number(v))),
  totale_rischio: z.coerce.number().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Number(v))),
  fido_residuo: z.coerce.number().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Number(v))),
  scaduto: z.coerce.number().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Number(v))),
  a_scadere: z.coerce.number().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Number(v))),
  condizioni_pagamento: z.string().trim().max(500).optional().or(z.literal("")),
  dilazione_concordata: z.coerce.number().int().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Math.trunc(Number(v)))),
  dilazione_effettiva: z.coerce.number().int().optional().or(z.literal("")).transform((v) => (v === "" || v === undefined || Number.isNaN(v as number) ? undefined : Math.trunc(Number(v)))),
  partita_iva: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  provincia: z.string().trim().max(5).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});


type ParsedRow = {
  idx: number;
  data: z.infer<typeof rowSchema>;
  errors: string[];
};

// Mappa header italiani/inglesi → campo db
const HEADER_MAP: Record<string, keyof z.infer<typeof rowSchema>> = {
  "ragione sociale": "ragione_sociale",
  "ragionesociale": "ragione_sociale",
  "nome": "ragione_sociale",
  "denominazione": "ragione_sociale",
  "codice gestionale": "codice_gestionale",
  "codice": "codice_gestionale",
  "cod gestionale": "codice_gestionale",
  "fido": "fido",
  "totale rischio": "totale_rischio",
  "totale esposizione": "totale_rischio",
  "esposizione": "totale_rischio",
  "fido residuo": "fido_residuo",
  "residuo": "fido_residuo",
  "scaduto": "scaduto",
  "a scadere": "a_scadere",
  "ascadere": "a_scadere",
  "condizione pagamento": "condizioni_pagamento",
  "condizioni pagamento": "condizioni_pagamento",
  "condizioni di pagamento": "condizioni_pagamento",
  "pagamento": "condizioni_pagamento",
  "dilazione concordata": "dilazione_concordata",
  "dilazione effettiva": "dilazione_effettiva",
  "partita iva": "partita_iva",
  "p.iva": "partita_iva",
  "piva": "partita_iva",
  "vat": "partita_iva",
  "codice fiscale": "codice_fiscale",
  "cf": "codice_fiscale",
  "indirizzo": "indirizzo",
  "via": "indirizzo",
  "address": "indirizzo",
  "citta": "citta",
  "città": "citta",
  "city": "citta",
  "cap": "cap",
  "zip": "cap",
  "provincia": "provincia",
  "prov": "provincia",
  "telefono": "telefono",
  "tel": "telefono",
  "phone": "telefono",
  "email": "email",
  "e-mail": "email",
  "mail": "email",
  "note": "note",
  "notes": "note",
};


function normalize(h: string) {
  return String(h ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function ImportExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importa anagrafiche clienti da Excel ed esporta i dati per analisi o backup.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImportCard />
        <ExportCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HistoryCard kind="importazioni" />
        <HistoryCard kind="esportazioni" />
      </div>
    </div>
  );
}

/* ============================ IMPORT ============================ */

function ImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores", "attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores").select("id, codice, nome").eq("attivo", true).order("codice");
      if (error) throw error;
      return data;
    },
  });

  function reset() {
    setFileName(null);
    setRows([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!raw.length) {
        toast.error("Il file non contiene righe");
        return;
      }
      const parsed: ParsedRow[] = raw.map((r, i) => {
        const mapped: Record<string, string> = {};
        for (const k of Object.keys(r)) {
          const field = HEADER_MAP[normalize(k)];
          if (field) mapped[field] = String(r[k] ?? "").trim();
        }
        const res = rowSchema.safeParse(mapped);
        return {
          idx: i + 2, // +2 = header + 1-index
          data: (res.success ? res.data : mapped) as z.infer<typeof rowSchema>,
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

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!valid.length) throw new Error("Nessuna riga valida");
      const { data: { user } } = await supabase.auth.getUser();

      // Crea record importazione
      const { data: imp, error: impErr } = await supabase.from("importazioni").insert({
        nome_file: fileName ?? "import.xlsx",
        righe_totali: rows.length,
        righe_errore: invalid.length,
        stato: "in_elaborazione",
        fonte: "upload_manuale",
        eseguita_da: user?.id ?? null,
        log_errori: invalid.length > 0
          ? invalid.slice(0, 100).map((r) => ({ riga: r.idx, errori: r.errors }))
          : null,
      }).select("id").single();
      if (impErr) throw impErr;

      const toNullable = <T,>(v: T | "" | undefined): T | null =>
        v === "" || v === undefined ? null : v;

      const buildPayload = (d: z.infer<typeof rowSchema>) => ({
        ragione_sociale: d.ragione_sociale,
        codice_gestionale: toNullable(d.codice_gestionale),
        partita_iva: toNullable(d.partita_iva),
        codice_fiscale: toNullable(d.codice_fiscale),
        indirizzo: toNullable(d.indirizzo),
        citta: toNullable(d.citta),
        cap: toNullable(d.cap),
        provincia: toNullable(d.provincia),
        telefono: toNullable(d.telefono),
        email: toNullable(d.email),
        note: toNullable(d.note),
        condizioni_pagamento: toNullable(d.condizioni_pagamento),
        fido: toNullable(d.fido),
        totale_rischio: toNullable(d.totale_rischio),
        fido_residuo: toNullable(d.fido_residuo),
        scaduto: toNullable(d.scaduto),
        a_scadere: toNullable(d.a_scadere),
        dilazione_concordata: toNullable(d.dilazione_concordata),
        dilazione_effettiva: toNullable(d.dilazione_effettiva),
        store_id: storeId || null,
      });

      // Carica clienti esistenti per deduplicazione (codice_gestionale o partita_iva)
      const codici = Array.from(new Set(valid.map((r) => r.data.codice_gestionale).filter((v): v is string => !!v)));
      const pive = Array.from(new Set(valid.map((r) => r.data.partita_iva).filter((v): v is string => !!v)));

      const existing = new Map<string, string>(); // chiave -> id
      if (codici.length) {
        const { data } = await supabase.from("clienti").select("id, codice_gestionale").in("codice_gestionale", codici);
        (data ?? []).forEach((c: any) => { if (c.codice_gestionale) existing.set(`cg:${c.codice_gestionale}`, c.id); });
      }
      if (pive.length) {
        const { data } = await supabase.from("clienti").select("id, partita_iva").in("partita_iva", pive);
        (data ?? []).forEach((c: any) => { if (c.partita_iva) existing.set(`pi:${c.partita_iva}`, c.id); });
      }

      let created = 0;
      let updated = 0;
      const errorLog: Array<{ riga: number; errore: string }> = [];

      try {
        for (const r of valid) {
          const payload = buildPayload(r.data);
          const existingId =
            (r.data.codice_gestionale && existing.get(`cg:${r.data.codice_gestionale}`)) ||
            (r.data.partita_iva && existing.get(`pi:${r.data.partita_iva}`)) ||
            null;

          if (existingId) {
            // UPDATE — non sovrascrivere store_id se non specificato
            const { store_id: _storeId, ...rest } = payload;
            const updatePayload = storeId ? payload : rest;
            const { error } = await supabase.from("clienti").update(updatePayload).eq("id", existingId);

            if (error) {
              errorLog.push({ riga: r.idx, errore: `Update: ${error.message}` });
            } else {
              updated += 1;
            }
          } else {
            const { data, error } = await supabase.from("clienti").insert(payload).select("id, codice_gestionale, partita_iva").single();
            if (error) {
              errorLog.push({ riga: r.idx, errore: `Insert: ${error.message}` });
            } else {
              created += 1;
              if (data?.codice_gestionale) existing.set(`cg:${data.codice_gestionale}`, data.id);
              if (data?.partita_iva) existing.set(`pi:${data.partita_iva}`, data.id);
            }
          }
        }

        const logFinale = [
          ...(invalid.length > 0 ? invalid.slice(0, 100).map((r) => ({ riga: r.idx, errori: r.errors })) : []),
          ...errorLog,
        ];
        await supabase.from("importazioni").update({
          righe_elaborate: valid.length,
          righe_create: created,
          righe_aggiornate: updated,
          righe_errore: invalid.length + errorLog.length,
          stato: (invalid.length + errorLog.length) > 0 ? "completata_con_errori" : "completata",
          completata_at: new Date().toISOString(),
          log_errori: logFinale.length ? logFinale : null,
        }).eq("id", imp.id);
      } catch (e) {
        await supabase.from("importazioni").update({
          righe_elaborate: created + updated,
          righe_create: created,
          righe_aggiornate: updated,
          stato: "fallita",
          completata_at: new Date().toISOString(),
          log_errori: [{ errore: e instanceof Error ? e.message : String(e) }],
        }).eq("id", imp.id);
        throw e;
      }

      return { created, updated };
    },
    onSuccess: ({ created, updated }) => {
      toast.success(`Import completato: ${created} creati, ${updated} aggiornati`);
      qc.invalidateQueries({ queryKey: ["clienti"] });

      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        ragione_sociale: "Esempio S.r.l.",
        codice_gestionale: "13908",
        fido: 50000,
        totale_rischio: 32000,
        fido_residuo: 18000,
        scaduto: 0,
        a_scadere: 32000,
        condizione_pagamento: "R.B. 60 gg. d.f. f.m.",
        dilazione_concordata: 60,
        dilazione_effettiva: 65,
        partita_iva: "12345678901",
        codice_fiscale: "12345678901",
        indirizzo: "Via Roma 1",
        citta: "Milano",
        cap: "20100",
        provincia: "MI",
        telefono: "+39 02 1234567",
        email: "info@esempio.it",
        note: "",
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clienti");
    XLSX.writeFile(wb, "template_import_clienti.xlsx");
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold flex items-center gap-2">
          <Upload className="size-4" /> Import clienti
        </h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={downloadTemplate}>
          <FileDown className="size-3.5" /> Template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Carica un file .xlsx / .csv. Colonna obbligatoria: <code>ragione_sociale</code>.
      </p>

      <div className="space-y-2 mb-4">
        <label className="text-xs font-medium">Assegna a punto vendita (opzionale)</label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
          <SelectContent>
            {stores?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!fileName ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
          <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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
            <Button variant="ghost" size="icon" onClick={reset}><X className="size-4" /></Button>
          </div>

          <div className="flex gap-2">
            <Badge variant="default" className="gap-1"><CheckCircle2 className="size-3" /> {valid.length} valide</Badge>
            {invalid.length > 0 && (
              <Badge variant="destructive" className="gap-1"><AlertCircle className="size-3" /> {invalid.length} errori</Badge>
            )}
          </div>

          {invalid.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border">
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
                      <TableCell className="text-xs text-destructive">{r.errors.join("; ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button
            className="w-full gap-1.5"
            disabled={!valid.length || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Importa {valid.length} clienti
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ============================ EXPORT ============================ */

function ExportCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "clienti" | "richieste">(null);

  async function logEsportazione(nome_file: string, righe: number) {
    const { data: { user } } = await supabase.auth.getUser();
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
        .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, attivo, privacy_firmata, stores(codice, nome)")
        .order("ragione_sociale");
      if (error) throw error;
      const flat = (data ?? []).map((c) => ({
        ragione_sociale: c.ragione_sociale,
        partita_iva: c.partita_iva,
        codice_fiscale: c.codice_fiscale,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap,
        provincia: c.provincia,
        telefono: c.telefono,
        email: c.email,
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
        .select("tipo, importo_richiesto, importo_approvato, durata_mesi, stato, livello_richiesto, livello_corrente, data_invio, data_chiusura, data_scadenza, motivazione, clienti(ragione_sociale, partita_iva), stores(codice, nome)")
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
      <p className="text-xs text-muted-foreground mb-4">
        Scarica i dati in formato Excel (.xlsx) per analisi o backup.
      </p>

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
          {busy === "clienti" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
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
          {busy === "richieste" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      </div>
    </Card>
  );
}

/* ============================ HISTORY ============================ */

function HistoryCard({ kind }: { kind: "importazioni" | "esportazioni" }) {
  const { data, isLoading } = useQuery({
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
  });

  const title = kind === "importazioni" ? "Ultime importazioni" : "Ultime esportazioni";
  const Icon = kind === "importazioni" ? Upload : Download;

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <Icon className="size-4" /> {title}
      </h2>
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
