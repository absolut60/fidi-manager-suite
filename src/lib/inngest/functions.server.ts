import * as XLSX from "xlsx";
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ---------- Utils (copia minimale lato server) ---------- */
function normalize(h: string) {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const ANAG_HEADERS: Record<string, string> = {
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

function anagraficaSheetToObjects(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  if (!matrix.length) return [];
  const rowHasRagSoc = (r: unknown[] | undefined) =>
    (r ?? []).some((c) => normalize(String(c ?? "")) === "ragione sociale");
  let headerIdx = -1, dataStart = -1;
  if (rowHasRagSoc(matrix[0])) { headerIdx = 0; dataStart = 1; }
  else if (rowHasRagSoc(matrix[1])) { headerIdx = 1; dataStart = 3; }
  else return [];
  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const out: Array<Record<string, string> & { __row: number }> = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (!h) return;
      const f = ANAG_HEADERS[normalize(h)];
      if (f) obj[f] = String(row[j] ?? "").trim();
    });
    if (!obj.ragione_sociale) continue;
    out.push(Object.assign(obj, { __row: i + 1 }));
  }
  return out;
}

/* ---------- Funzione: processa l'import anagrafica in background ---------- */
export const processAnagraficaImport = inngest.createFunction(
  {
    id: "process-anagrafica-import",
    name: "Process anagrafica import",
    retries: 2,
    triggers: [{ event: "import/anagrafica.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as {
      importazioneId: string;
      filePath: string;
    };

    const errorLog: Array<{ riga: number; errore: string }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const updateStato = async (
      stato: "in_elaborazione" | "completata" | "completata_con_errori",
      done = false,
    ) => {
      await supabaseAdmin.from("importazioni").update({
        righe_elaborate: created + updated + errorLog.length,
        righe_create: created,
        righe_aggiornate: updated,
        righe_errore: skipped + errorLog.length,
        stato,
        completata_at: done ? new Date().toISOString() : null,
        log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
      }).eq("id", importazioneId);
    };

    try {
      // 1) Download + parse
      const rows = await step.run("download-and-parse", async () => {
        const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
        if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = anagraficaSheetToObjects(sheet);
        return parsed;
      });

      logger.info(`Parsed ${rows.length} righe`);
      await supabaseAdmin.from("importazioni").update({
        righe_totali: rows.length, stato: "in_elaborazione",
      }).eq("id", importazioneId);

      if (!rows.length) {
        await updateStato("completata_con_errori", true);
        return { rows: 0 };
      }

      // 2) Lookup stores
      const { stores, storesByIndex } = await step.run("load-stores", async () => {
        const { data } = await supabaseAdmin.from("stores").select("id, codice").order("codice");
        const map: Record<string, string> = {};
        (data ?? []).forEach((s) => { if (s.codice) map[s.codice] = s.id; });
        return { stores: map, storesByIndex: data ?? [] };
      });

      // 3) Lookup clienti esistenti
      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale).filter(Boolean)));
      const pive = Array.from(new Set(rows.map((r) => r.partita_iva).filter(Boolean)));
      const existing = await step.run("lookup-existing", async () => {
        const map: Record<string, string> = {};
        if (codici.length) {
          const { data } = await supabaseAdmin.from("clienti")
            .select("id, codice_gestionale").in("codice_gestionale", codici);
          (data ?? []).forEach((c) => { if (c.codice_gestionale) map[`cg:${c.codice_gestionale}`] = c.id; });
        }
        if (pive.length) {
          const { data } = await supabaseAdmin.from("clienti")
            .select("id, partita_iva").in("partita_iva", pive);
          (data ?? []).forEach((c) => { if (c.partita_iva) map[`pi:${c.partita_iva}`] = c.id; });
        }
        return map;
      });

      // 4) Prepara payload
      type Prepared = { idx: number; payload: Record<string, unknown>; existId: string | null };
      const prepared: Prepared[] = [];
      for (const r of rows) {
        let storeId: string | null = null;
        if (r.store_codice) {
          storeId = stores[r.store_codice] ?? null;
          if (!storeId && /^\d+$/.test(r.store_codice.trim())) {
            const idx = parseInt(r.store_codice.trim(), 10) - 1;
            if (idx >= 0 && idx < storesByIndex.length) storeId = storesByIndex[idx].id;
          }
          if (!storeId) errorLog.push({ riga: r.__row, errore: `Store '${r.store_codice}' non trovato (warning)` });
        }
        const payload: Record<string, unknown> = {
          ragione_sociale: r.ragione_sociale,
          codice_gestionale: toStr(r.codice_gestionale),
          partita_iva: toStr(r.partita_iva),
          codice_fiscale: toStr(r.codice_fiscale),
          tipo_soggetto: toStr(r.forma_giuridica),
          indirizzo: toStr(r.indirizzo),
          citta: toStr(r.citta),
          cap: toStr(r.cap),
          provincia: toStr(r.provincia),
          telefono: toStr(r.telefono),
          email: toStr(r.email),
          pec: toStr(r.pec),
          codice_sdi: toStr(r.codice_sdi),
          note: toStr(r.note),
        };
        if (storeId) payload.store_id = storeId;
        const existId =
          (r.codice_gestionale && existing[`cg:${r.codice_gestionale}`]) ||
          (r.partita_iva && existing[`pi:${r.partita_iva}`]) || null;
        prepared.push({ idx: r.__row, payload, existId });
      }

      const toInsert = prepared.filter((p) => !p.existId);
      const toUpdate = prepared.filter((p) => p.existId);
      const BATCH = 100;

      // 5) Insert a batch
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const stepId = `insert-batch-${i}`;
        const res = await step.run(stepId, async () => {
          const { data, error } = await supabaseAdmin
            .from("clienti")
            .insert(chunk.map((c) => c.payload) as never)
            .select("id");
          if (error) {
            let ok = 0; const errs: Array<{ riga: number; errore: string }> = [];
            for (const c of chunk) {
              const { error: e2 } = await supabaseAdmin.from("clienti").insert(c.payload as never);
              if (e2) errs.push({ riga: c.idx, errore: `Insert: ${e2.message}` });
              else ok++;
            }
            return { ok, errs };
          }
          return { ok: data?.length ?? chunk.length, errs: [] as Array<{ riga: number; errore: string }> };
        });
        created += res.ok;
        errorLog.push(...res.errs);
        await updateStato("in_elaborazione");
      }

      // 6) Update a batch
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        const stepId = `update-batch-${i}`;
        const res = await step.run(stepId, async () => {
          let ok = 0; const errs: Array<{ riga: number; errore: string }> = [];
          await Promise.all(chunk.map(async (c) => {
            const { error } = await supabaseAdmin.from("clienti").update(c.payload as never).eq("id", c.existId!);
            if (error) errs.push({ riga: c.idx, errore: `Update: ${error.message}` });
            else ok++;
          }));
          return { ok, errs };
        });
        updated += res.ok;
        errorLog.push(...res.errs);
        await updateStato("in_elaborazione");
      }

      const finalState = errorLog.length > 0 ? "completata_con_errori" : "completata";
      await updateStato(finalState, true);
      return { created, updated, skipped, errors: errorLog.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errorLog.push({ riga: 0, errore: `Errore fatale: ${msg}` });
      await updateStato("completata_con_errori", true);
      throw err;
    }
  },
);
