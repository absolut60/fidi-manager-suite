import * as XLSX from "xlsx";
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  anagraficaSheetToObjects,
  parseRischioSheet,
  parseScadenziarioBlockSheet,
  parseAssicurazioneSheet,
  scanScadenziarioMeta,
  parseScadenziarioRangeLean,
  toStr,
  normalize,
  findSheetByName,
  type ScadRow,
} from "./parsers.server";

type EventData = { importazioneId: string; filePath: string; userId?: string };

/* ============================================================================
 * Utility comuni
 * ============================================================================ */

async function downloadWorkbook(filePath: string, sheets?: string[]) {
  const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
  if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, {
    type: "array",
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    sheetStubs: false,
    bookDeps: false,
    bookFiles: false,
    bookProps: false,
    bookVBA: false,
    ...(sheets && sheets.length ? { sheets } : {}),
  });
}

async function setImportazioneError(importazioneId: string, message: string) {
  await supabaseAdmin
    .from("importazioni")
    .update({
      stato: "completata_con_errori",
      completata_at: new Date().toISOString(),
      log_errori: [{ riga: 0, errore: `Errore fatale: ${message}` }],
    })
    .eq("id", importazioneId);
}

async function downloadJsonFromStorage<T>(filePath: string): Promise<T> {
  const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
  if (error || !file) throw new Error(`Download JSON fallito: ${error?.message ?? "no data"}`);
  return JSON.parse(await file.text()) as T;
}

type StagedScadenziarioManifest = {
  kind: "scadenziario-staging-v1";
  originalFilePath: string;
  totRead: number;
  chunkCount: number;
  chunks: Array<{ chunkIndex: number; chunkPath: string; rowsCount: number; missingCount: number }>;
};

type StagedScadenziarioChunk = {
  rows: ScadRow[];
  missing: number[];
};

async function sendInngestEvents(events: object[]): Promise<void> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
  console.log("SEND INNGEST EVENTS:", {
    count: events.length,
    hasLovableKey: !!LOVABLE_API_KEY,
    hasInngestKey: !!INNGEST_API_KEY,
    firstEvent: events[0],
  });
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configurata");
  if (!INNGEST_API_KEY) throw new Error("INNGEST_API_KEY non configurata");

  // Prima prova con array (più efficiente)
  const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": INNGEST_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
  });
  const responseText = await res.text();
  console.log("GATEWAY ARRAY RESPONSE:", {
    status: res.status,
    statusText: res.statusText,
    body: responseText.slice(0, 500),
  });
  if (res.ok) return;

  // Fallback: invio singolo evento per evento
  console.log("Array fallito, provo invio singolo...");
  for (const event of events) {
    const resSingle = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    const singleText = await resSingle.text();
    console.log("GATEWAY SINGLE RESPONSE:", {
      status: resSingle.status,
      body: singleText.slice(0, 200),
    });
    if (!resSingle.ok) {
      throw new Error(`Inngest gateway single error ${resSingle.status}: ${singleText}`);
    }
  }
}

/* ============================================================================
 * A — ANAGRAFICA
 * ============================================================================ */

export const processAnagraficaImport = inngest.createFunction(
  {
    id: "process-anagrafica-import",
    name: "Process anagrafica import",
    retries: 2,
    triggers: [{ event: "import/anagrafica.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    const errorLog: Array<{ riga: number; errore: string }> = [];
    let created = 0,
      updated = 0;
    const skipped = 0;

    const update = async (
      stato: "in_elaborazione" | "completata" | "completata_con_errori",
      done = false,
    ) => {
      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_elaborate: created + updated + errorLog.length,
          righe_create: created,
          righe_aggiornate: updated,
          righe_errore: skipped + errorLog.length,
          stato,
          completata_at: done ? new Date().toISOString() : null,
          log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
        })
        .eq("id", importazioneId);
    };

    try {
      const rows = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        return anagraficaSheetToObjects(wb.Sheets[wb.SheetNames[0]]);
      });
      logger.info(`Anagrafica: ${rows.length} righe`);
      await supabaseAdmin
        .from("importazioni")
        .update({ righe_totali: rows.length, stato: "in_elaborazione" })
        .eq("id", importazioneId);
      if (!rows.length) {
        await update("completata_con_errori", true);
        return { rows: 0 };
      }

      const { stores, storesByIndex } = await step.run("load-stores", async () => {
        const { data } = await supabaseAdmin.from("stores").select("id, codice").order("codice");
        const map: Record<string, string> = {};
        (data ?? []).forEach((s) => {
          if (s.codice) map[s.codice] = s.id;
        });
        return { stores: map, storesByIndex: data ?? [] };
      });

      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale).filter(Boolean)));
      const pive = Array.from(new Set(rows.map((r) => r.partita_iva).filter(Boolean)));
      const existing = await step.run("lookup-existing", async () => {
        const map: Record<string, string> = {};
        if (codici.length) {
          const { data } = await supabaseAdmin
            .from("clienti")
            .select("id, codice_gestionale")
            .in("codice_gestionale", codici);
          (data ?? []).forEach((c) => {
            if (c.codice_gestionale) map[`cg:${c.codice_gestionale}`] = c.id;
          });
        }
        if (pive.length) {
          const { data } = await supabaseAdmin
            .from("clienti")
            .select("id, partita_iva")
            .in("partita_iva", pive);
          (data ?? []).forEach((c) => {
            if (c.partita_iva) map[`pi:${c.partita_iva}`] = c.id;
          });
        }
        return map;
      });

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
          if (!storeId)
            errorLog.push({
              riga: r.__row,
              errore: `Store '${r.store_codice}' non trovato (warning)`,
            });
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
          (r.partita_iva && existing[`pi:${r.partita_iva}`]) ||
          null;
        prepared.push({ idx: r.__row, payload, existId });
      }

      const toInsert = prepared.filter((p) => !p.existId);
      const toUpdate = prepared.filter((p) => p.existId);
      const BATCH = 100;

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const res = await step.run(`insert-batch-${i}`, async () => {
          const { data, error } = await supabaseAdmin
            .from("clienti")
            .insert(chunk.map((c) => c.payload) as never)
            .select("id");
          if (error) {
            let ok = 0;
            const errs: Array<{ riga: number; errore: string }> = [];
            for (const c of chunk) {
              const { error: e2 } = await supabaseAdmin.from("clienti").insert(c.payload as never);
              if (e2) errs.push({ riga: c.idx, errore: `Insert: ${e2.message}` });
              else ok++;
            }
            return { ok, errs };
          }
          return {
            ok: data?.length ?? chunk.length,
            errs: [] as Array<{ riga: number; errore: string }>,
          };
        });
        created += res.ok;
        errorLog.push(...res.errs);
        await update("in_elaborazione");
      }

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        const res = await step.run(`update-batch-${i}`, async () => {
          let ok = 0;
          const errs: Array<{ riga: number; errore: string }> = [];
          await Promise.all(
            chunk.map(async (c) => {
              const { error } = await supabaseAdmin
                .from("clienti")
                .update(c.payload as never)
                .eq("id", c.existId!);
              if (error) errs.push({ riga: c.idx, errore: `Update: ${error.message}` });
              else ok++;
            }),
          );
          return { ok, errs };
        });
        updated += res.ok;
        errorLog.push(...res.errs);
        await update("in_elaborazione");
      }

      await update(errorLog.length ? "completata_con_errori" : "completata", true);
      return { created, updated, skipped, errors: errorLog.length };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

/* ============================================================================
 * B — ANALISI RISCHIO
 * ============================================================================ */

export const processRischioImport = inngest.createFunction(
  {
    id: "process-rischio-import",
    name: "Process rischio import",
    retries: 2,
    triggers: [{ event: "import/analisi_rischio.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    try {
      const { rows, missing } = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        return parseRischioSheet(wb.Sheets[wb.SheetNames[0]]);
      });
      logger.info(`Rischio: ${rows.length} righe, ${missing.length} senza codice`);

      const errorLog: Array<{ riga: number; errore: string }> = missing.map((idx) => ({
        riga: idx,
        errore: "Codice gestionale mancante",
      }));
      let updated = 0;

      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_totali: rows.length + missing.length,
          stato: "in_elaborazione",
        })
        .eq("id", importazioneId);

      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      const map = new Map<string, string>();
      if (codici.length) {
        const { data } = await supabaseAdmin
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", codici);
        (data ?? []).forEach((c) => {
          if (c.codice_gestionale) map.set(c.codice_gestionale, c.id);
        });
      }

      const now = new Date().toISOString();
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await step.run(`update-batch-${i}`, async () => {
          let ok = 0;
          const errs: Array<{ riga: number; errore: string }> = [];
          await Promise.all(
            chunk.map(async (r) => {
              const id = map.get(r.codice_gestionale);
              if (!id) {
                errs.push({
                  riga: r.idx,
                  errore: `Codice ${r.codice_gestionale} non trovato${r.ragione_sociale ? ` (${r.ragione_sociale})` : ""}`,
                });
                return;
              }
              const { error } = await supabaseAdmin
                .from("clienti")
                .update({ ...r.payload, ultima_sincronizzazione: now } as never)
                .eq("id", id);
              if (error) errs.push({ riga: r.idx, errore: `Update: ${error.message}` });
              else ok++;
            }),
          );
          return { ok, errs };
        });
        updated += res.ok;
        errorLog.push(...res.errs);
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_elaborate: Math.min(i + BATCH, rows.length),
            righe_aggiornate: updated,
            righe_errore: errorLog.length,
            stato: "in_elaborazione",
          })
          .eq("id", importazioneId);
      }

      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_elaborate: rows.length,
          righe_create: 0,
          righe_aggiornate: updated,
          righe_errore: errorLog.length,
          stato: errorLog.length ? "completata_con_errori" : "completata",
          completata_at: new Date().toISOString(),
          log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
        })
        .eq("id", importazioneId);

      return { updated, errors: errorLog.length };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

/* ============================================================================
 * C — SCADENZIARIO (fan-out: init → N chunk → finalize)
 * ============================================================================ */

const SCAD_CHUNK_SIZE = 1000;

// Helper: leggi opzioni "lean" per XLSX.read per ridurre il peak memory
function xlsxLeanOpts() {
  return {
    type: "array" as const,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    sheetStubs: false,
    bookDeps: false,
    bookFiles: false,
    bookProps: false,
    bookSheets: false,
    bookVBA: false,
  };
}

async function downloadWorkbookLean(filePath: string, sheetName: string) {
  const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
  if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
  const buf = await file.arrayBuffer();
  // sheets: limita parsing al solo foglio richiesto
  return XLSX.read(buf, { ...xlsxLeanOpts(), sheets: [sheetName] });
}

export const processScadenziarioImport = inngest.createFunction(
  {
    id: "process-scadenziario-import",
    name: "Process scadenziario import (init + fan-out)",
    retries: 2,
    triggers: [{ event: "import/scadenziario.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath, userId } = event.data as EventData;
    try {
      if (filePath.startsWith("_staging/") && filePath.endsWith("/manifest.json")) {
        const manifest = await step.run("load-staged-manifest", async () => {
          return downloadJsonFromStorage<StagedScadenziarioManifest>(filePath);
        });
        const timestampInizio = await step.run("init-timestamp", async () =>
          new Date().toISOString(),
        );
        const chunkCount = Math.max(1, manifest.chunkCount);

        await step.run("init-importazione", async () => {
          await supabaseAdmin
            .from("importazioni")
            .update({
              righe_totali: manifest.totRead,
              righe_elaborate: 0,
              righe_create: 0,
              righe_aggiornate: 0,
              righe_errore: 0,
              chunks_totali: chunkCount,
              chunks_completati: 0,
              stato: "in_elaborazione",
              log_errori: [
                {
                  riga: 0,
                  errore: `Init staging: ${manifest.totRead} righe totali, ${chunkCount} chunk da storage`,
                },
              ],
            } as never)
            .eq("id", importazioneId);
        });

        const events = manifest.chunks.map((chunk) => ({
          name: "import/scadenziario.chunk" as const,
          data: {
            importazioneId,
            filePath: manifest.originalFilePath,
            chunkPath: chunk.chunkPath,
            userId,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunkCount,
            startRow0: 0,
            endRow0: 0,
            headers: [],
            timestampInizio,
          },
        }));
        const SEND_BATCH = 50;
        for (let i = 0; i < events.length; i += SEND_BATCH) {
          const slice = events.slice(i, i + SEND_BATCH);
          await step.run(`send-staged-chunks-${i}`, async () => {
            await sendInngestEvents(slice);
          });
        }

        logger.info(`Scadenziario staging init: rows=${manifest.totRead}, chunks=${chunkCount}`);
        return { totRows: manifest.totRead, chunkCount, staged: true };
      }

      // STEP 1: download leggero + scan metadati (no parse completo)
      const meta = await step.run("scan-meta", async () => {
        const wb = await downloadWorkbookLean(filePath, "SCADENZIARIO");
        const sheet = findSheetByName(wb, "SCADENZIARIO");
        if (!sheet) throw new Error("Foglio SCADENZIARIO non trovato nel file");
        const m = scanScadenziarioMeta(sheet);
        return m;
      });

      const totRows = Math.max(0, meta.lastRow - meta.firstDataRow + 1);
      const chunkCount = Math.max(1, Math.ceil(totRows / SCAD_CHUNK_SIZE));
      const timestampInizio = await step.run("init-timestamp", async () =>
        new Date().toISOString(),
      );

      logger.info(
        `Scadenziario init: lastRow=${meta.lastRow}, totRows~${totRows}, chunks=${chunkCount}`,
      );

      await step.run("init-importazione", async () => {
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: totRows,
            righe_elaborate: 0,
            righe_create: 0,
            righe_aggiornate: 0,
            righe_errore: 0,
            chunks_totali: chunkCount,
            chunks_completati: 0,
            stato: "in_elaborazione",
            log_errori: [
              {
                riga: 0,
                errore: `Init: ${totRows} righe totali, ${chunkCount} chunk da ${SCAD_CHUNK_SIZE}`,
              },
            ],
          } as never)
          .eq("id", importazioneId);
      });

      // STEP 2: fan-out di un evento per chunk
      const events = [];
      for (let i = 0; i < chunkCount; i++) {
        const startRow0 = meta.firstDataRow + i * SCAD_CHUNK_SIZE;
        const endRow0 = Math.min(startRow0 + SCAD_CHUNK_SIZE - 1, meta.lastRow);
        events.push({
          name: "import/scadenziario.chunk" as const,
          data: {
            importazioneId,
            filePath,
            userId,
            chunkIndex: i,
            totalChunks: chunkCount,
            startRow0,
            endRow0,
            headers: meta.headers,
            timestampInizio,
          },
        });
      }
      // Invio in batch da 50 per non gonfiare il payload
      const SEND_BATCH = 50;
      for (let i = 0; i < events.length; i += SEND_BATCH) {
        const slice = events.slice(i, i + SEND_BATCH);
        await step.run(`send-chunks-${i}`, async () => {
          await sendInngestEvents(slice);
        });
      }

      return { totRows, chunkCount };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

type ChunkEventData = {
  importazioneId: string;
  filePath: string;
  chunkPath?: string;
  userId?: string;
  chunkIndex: number;
  totalChunks: number;
  startRow0: number;
  endRow0: number;
  headers: string[];
  timestampInizio: string;
};

export const processScadenziarioChunk = inngest.createFunction(
  {
    id: "process-scadenziario-chunk",
    name: "Process scadenziario chunk",
    retries: 3,
    concurrency: { limit: 3 },
    triggers: [{ event: "import/scadenziario.chunk" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as ChunkEventData;
    const {
      importazioneId,
      filePath,
      chunkPath,
      userId,
      chunkIndex,
      totalChunks,
      startRow0,
      endRow0,
      headers,
      timestampInizio,
    } = data;

    // STEP A: download + parse SOLO il range, oppure carica chunk JSON pre-staged
    const parsed = await step.run("download-parse-range", async () => {
      if (chunkPath) {
        const staged = await downloadJsonFromStorage<StagedScadenziarioChunk>(chunkPath);
        const codici = Array.from(new Set(staged.rows.map((r) => r.codice_gestionale)));
        return { rows: staged.rows, missing: staged.missing, codici };
      }
      const wb = await downloadWorkbookLean(filePath, "SCADENZIARIO");
      const sheet = findSheetByName(wb, "SCADENZIARIO");
      if (!sheet) throw new Error("Foglio SCADENZIARIO non trovato");
      const { rows, missing } = parseScadenziarioRangeLean(sheet, headers, startRow0, endRow0);
      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      return { rows, missing, codici };
    });

    const { rows, missing, codici } = parsed;
    logger.info(
      `Chunk ${chunkIndex + 1}/${totalChunks}: rows=${rows.length}, missing=${missing.length}, codici=${codici.length}`,
    );

    // STEP B: lookup clienti per codici di questo chunk
    const clientMap = await step.run("lookup-clienti", async () => {
      const out: Record<string, string> = {};
      if (!codici.length) return out;
      const BATCH = 500;
      for (let i = 0; i < codici.length; i += BATCH) {
        const slice = codici.slice(i, i + BATCH);
        const { data: cdata } = await supabaseAdmin
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", slice as string[]);
        (cdata ?? []).forEach((c) => {
          if (c.codice_gestionale) out[c.codice_gestionale] = c.id;
        });
      }
      return out;
    });

    // STEP C: prepara, deduplica, upsert
    const result = await step.run("upsert-batch", async () => {
      const rowErrs: Array<{ riga: number; errore: string }> = missing.map((idx) => ({
        riga: idx,
        errore: "COD_CLI mancante",
      }));
      const batchErrs: Array<{ riga: number; errore: string }> = [];
      const matched: string[] = [];
      const rawValidRows: Array<Record<string, unknown>> = [];
      let skipped = 0;
      const skippedCodes = new Set<string>();
      for (const r of rows) {
        const cid = clientMap[r.codice_gestionale];
        if (!cid) {
          // Cliente non in anagrafica: salta silenziosamente (non conta come errore)
          skipped++;
          if (r.codice_gestionale) skippedCodes.add(String(r.codice_gestionale));
          continue;
        }
        matched.push(cid);
        rawValidRows.push({
          ...r.payload,
          cliente_id: cid,
          importato_da: importazioneId,
          ultima_sincronizzazione: timestampInizio,
        });
      }

      // Dedup per chiave conflict
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of rawValidRows) {
        const cid = row.cliente_id as string;
        const numDoc = (row.numero_documento as string | null | undefined) ?? "NULL";
        const sez = (row.sezionale as string | null | undefined) ?? "NULL";
        const anno =
          (row.anno_partita as number | null | undefined) != null
            ? String(row.anno_partita)
            : "NULL";
        deduped.set(`${cid}|${numDoc}|${sez}|${anno}`, row);
      }
      const validRows = Array.from(deduped.values());
      const validKeys = new Set(deduped.keys());

      // Pre-fetch chiavi esistenti per distinguere create vs update
      const cids = Array.from(new Set(matched));
      const existingKeys = new Set<string>();
      if (cids.length) {
        const { data: edata } = await supabaseAdmin
          .from("scadenze" as never)
          .select("cliente_id, numero_documento, sezionale, anno_partita")
          .in("cliente_id", cids);
        (
          (edata ?? []) as Array<{
            cliente_id: string;
            numero_documento: string | null;
            sezionale: string | null;
            anno_partita: number | null;
          }>
        ).forEach((s) => {
          existingKeys.add(
            `${s.cliente_id}|${s.numero_documento ?? "NULL"}|${s.sezionale ?? "NULL"}|${s.anno_partita != null ? String(s.anno_partita) : "NULL"}`,
          );
        });
      }

      let c = 0;
      let u = 0;
      if (validRows.length) {
        const { error: upErr } = await (
          supabaseAdmin.from("scadenze" as never) as never as {
            upsert: (
              rows: unknown,
              opts: { onConflict: string; ignoreDuplicates: boolean },
            ) => Promise<{ error: { message: string } | null }>;
          }
        ).upsert(validRows, {
          onConflict: "cliente_id,numero_documento,sezionale,anno_partita",
          ignoreDuplicates: false,
        });
        if (upErr) {
          batchErrs.push({
            riga: chunkIndex,
            errore: `Upsert chunk ${chunkIndex}: ${upErr.message}`,
          });
        } else {
          // Conta create vs update in base alle chiavi pre-esistenti.
          // Non usiamo il count di Supabase: con upsert+onConflict ritorna
          // sempre 0 anche quando le righe vengono effettivamente scritte.
          for (const key of validKeys) {
            if (existingKeys.has(key)) u++;
            else c++;
          }
        }
      }

      return {
        created: c,
        updated: u,
        elaborate: rows.length + missing.length,
        skipped,
        skippedCodes: Array.from(skippedCodes),
        rowErrs,
        batchErrs,
        matchedCids: Array.from(new Set(matched)),
      };
    });

    // STEP D: incremento atomico contatori + aggrega codici mancanti
    const progress = await step.run("increment-counters", async () => {
      const totalErrs = result.rowErrs.length + result.batchErrs.length;
      const { data: rpc, error: rpcErr } = await (
        supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ chunks_completati: number; chunks_totali: number }> | null;
          error: { message: string } | null;
        }>
      )("increment_importazione_counters", {
        _id: importazioneId,
        _elaborate: result.elaborate,
        _create: result.created,
        _update: result.updated,
        _error: totalErrs,
        _skipped: result.skipped,
      });
      if (rpcErr) throw new Error(`increment_importazione_counters: ${rpcErr.message}`);

      // Append errori al log (best-effort) e aggrega codici mancanti unici (max 200)
      if (result.rowErrs.length || result.batchErrs.length || result.skippedCodes.length) {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori, codici_mancanti")
          .eq("id", importazioneId)
          .single();
        const updates: Record<string, unknown> = {};
        if (result.rowErrs.length || result.batchErrs.length) {
          const existing =
            (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
          updates.log_errori = [...existing, ...result.batchErrs, ...result.rowErrs].slice(0, 500);
        }
        if (result.skippedCodes.length) {
          const existingCodes = (cur?.codici_mancanti as string[] | null) ?? [];
          const merged = Array.from(new Set([...existingCodes, ...result.skippedCodes])).slice(
            0,
            200,
          );
          updates.codici_mancanti = merged;
        }
        await supabaseAdmin
          .from("importazioni")
          .update(updates as never)
          .eq("id", importazioneId);
      }

      const row = rpc?.[0] ?? { chunks_completati: 0, chunks_totali: totalChunks };
      return row;
    });

    // STEP E: se è l'ultimo chunk, emetti evento finalize
    if (progress.chunks_completati >= progress.chunks_totali) {
      await step.run("send-finalize", async () => {
        await sendInngestEvents([
          {
            name: "import/scadenziario.finalize",
            data: { importazioneId, timestampInizio },
          },
        ]);
      });
    }

    return { chunkIndex, ...result, progress };
  },
);

export const finalizeScadenziarioImport = inngest.createFunction(
  {
    id: "finalize-scadenziario-import",
    name: "Finalize scadenziario import (reconciliation)",
    retries: 2,
    triggers: [{ event: "import/scadenziario.finalize" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, timestampInizio } = event.data as {
      importazioneId: string;
      timestampInizio: string;
    };
    try {
      // Reconciliation: chiude scadenze "fantasma" (Aperta + ultima_sincronizzazione < timestampInizio)
      const reconc = await step.run("reconciliation", async () => {
        // Trova clienti coinvolti: quelli con scadenze importato_da = questa importazione
        const { data: cidsData } = await supabaseAdmin
          .from("scadenze" as never)
          .select("cliente_id")
          .eq("importato_da", importazioneId)
          .limit(50000);
        const cids = Array.from(
          new Set(((cidsData ?? []) as Array<{ cliente_id: string }>).map((r) => r.cliente_id)),
        );
        if (!cids.length) return { totChiuse: 0, totClienti: 0 };

        const BATCH = 200;
        let totChiuse = 0;
        const clientiCoinvolti = new Set<string>();
        const nota = `Chiusa automaticamente: assente nel file di sincronizzazione del ${timestampInizio}`;
        const dataPagamento = new Date().toISOString();
        for (let i = 0; i < cids.length; i += BATCH) {
          const slice = cids.slice(i, i + BATCH);
          const { data: toClose } = await supabaseAdmin
            .from("scadenze" as never)
            .select("id, cliente_id")
            .in("cliente_id", slice)
            .eq("stato_contabile", "Aperta")
            .lt("ultima_sincronizzazione", timestampInizio);
          const closeRows = (toClose ?? []) as Array<{ id: string; cliente_id: string }>;
          if (!closeRows.length) continue;
          const ids = closeRows.map((r) => r.id);
          closeRows.forEach((r) => clientiCoinvolti.add(r.cliente_id));
          const { error } = await supabaseAdmin
            .from("scadenze" as never)
            .update({
              stato_contabile: "Chiusa",
              data_pagamento: dataPagamento,
              note: nota,
            } as never)
            .in("id", ids);
          if (error) throw new Error(`Reconciliation: ${error.message}`);
          totChiuse += closeRows.length;
        }
        return { totChiuse, totClienti: clientiCoinvolti.size };
      });

      // Aggiornamento finale dello stato
      await step.run("set-final-state", async () => {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("righe_errore, log_errori")
          .eq("id", importazioneId)
          .single();
        const errs = (cur?.righe_errore as number | null) ?? 0;
        const existing = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
        const summary = [
          {
            riga: 0,
            errore: `Reconciliation: chiuse ${reconc.totChiuse} scadenze su ${reconc.totClienti} clienti`,
          },
        ];
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato: errs > 0 ? "completata_con_errori" : "completata",
            completata_at: new Date().toISOString(),
            log_errori: [...summary, ...existing].slice(0, 500),
          } as never)
          .eq("id", importazioneId);
      });

      logger.info(
        `Finalize ${importazioneId}: chiuse=${reconc.totChiuse}, clienti=${reconc.totClienti}`,
      );
      return reconc;
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

/* ============================================================================
 * D — SCADENZIARIO + ASSICURAZIONI (file unico, due fogli)
 * ============================================================================ */

export const processScadAssicImport = inngest.createFunction(
  {
    id: "process-scad-assic-import",
    name: "Process scadenziario+assicurazioni import",
    retries: 2,
    triggers: [{ event: "import/scadenziario_assicurazioni.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath, userId } = event.data as EventData;
    try {
      const parsed = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        const findSheet = (kw: string) => {
          const name =
            wb.SheetNames.find((n) => normalize(n) === normalize(kw)) ??
            wb.SheetNames.find((n) => normalize(n).includes(normalize(kw)));
          return name ? wb.Sheets[name] : null;
        };
        const sScad = findSheet("scadenziario");
        const sAssic = findSheet("assicurazione");
        const warnings: string[] = [];
        let scadRows: Awaited<ReturnType<typeof parseScadenziarioBlockSheet>>["rows"] = [];
        let scadTot = 0;
        if (!sScad) warnings.push("Foglio 'SCADENZIARIO' non trovato.");
        else {
          const r = parseScadenziarioBlockSheet(sScad);
          scadRows = r.rows;
          scadTot = r.totRead;
        }
        const assicRows = sAssic ? parseAssicurazioneSheet(sAssic) : [];
        if (!sAssic) warnings.push("Foglio 'ASSICURAZIONE' non trovato.");
        return { scadRows, assicRows, scadTot, warnings };
      });

      const { scadRows, assicRows, scadTot, warnings } = parsed;
      logger.info(`Scad+Assic: ${scadRows.length} scadenze, ${assicRows.length} polizze`);

      const log: string[] = [...warnings];
      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_totali: scadRows.length + assicRows.length,
          stato: "in_elaborazione",
        })
        .eq("id", importazioneId);

      const allCodes = Array.from(
        new Set([...scadRows.map((r) => r.cod_cli), ...assicRows.map((r) => r.cod_cli)]),
      );
      const clientMap = new Map<string, string>();
      if (allCodes.length) {
        const { data } = await supabaseAdmin
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", allCodes);
        (data ?? []).forEach((c) => {
          if (c.codice_gestionale) clientMap.set(String(c.codice_gestionale), c.id);
        });
      }
      const clientIds = Array.from(new Set(Array.from(clientMap.values())));

      // pre-load scadenze esistenti
      const existingScad = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin
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

      // pre-load solleciti
      const existingSoll = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin
          .from("solleciti" as never)
          .select("cliente_id, nota")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; nota: string }>).forEach((s) => {
          existingSoll.add(`${s.cliente_id}|${(s.nota ?? "").trim()}`);
        });
      }

      // pre-load pratiche legali aperte
      const openLegale = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin
          .from("pratiche_legali" as never)
          .select("cliente_id, stato")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; stato: string }>).forEach((p) => {
          if (p.stato !== "chiusa") openLegale.add(p.cliente_id);
        });
      }

      let scadCreated = 0,
        scadUpdated = 0,
        scadSkipped = 0;
      const matchedClients = new Set<string>();
      const clientsToBlock = new Set<string>();
      const clientsLegale = new Set<string>();
      const now = new Date().toISOString();

      const BATCH = 40;
      for (let i = 0; i < scadRows.length; i += BATCH) {
        const chunk = scadRows.slice(i, i + BATCH);
        const res = await step.run(`scad-batch-${i}`, async () => {
          let c = 0,
            u = 0,
            s = 0;
          const logs: string[] = [];
          const block: string[] = [];
          const legale: string[] = [];
          for (const r of chunk) {
            const cid = clientMap.get(r.cod_cli);
            if (!cid) {
              s++;
              logs.push(`Riga ${r.excelRow}: cliente ${r.cod_cli} non trovato`);
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
              importato_da: importazioneId,
              ultima_sincronizzazione: now,
            };
            if (existId) {
              const { error } = await supabaseAdmin
                .from("scadenze" as never)
                .update(payload as never)
                .eq("id", existId);
              if (error) {
                s++;
                logs.push(`Riga ${r.excelRow}: ${error.message}`);
              } else u++;
            } else {
              const { error } = await supabaseAdmin
                .from("scadenze" as never)
                .insert(payload as never);
              if (error) {
                s++;
                logs.push(`Riga ${r.excelRow}: ${error.message}`);
              } else c++;
            }
            if (r.bloccato) block.push(cid);
            if (r.note_solleciti) {
              const dkey = `${cid}|${r.note_solleciti.trim()}`;
              if (!existingSoll.has(dkey)) {
                const { error } = await supabaseAdmin.from("solleciti" as never).insert({
                  cliente_id: cid,
                  tipo: "interno",
                  nota: r.note_solleciti,
                  inserito_da: userId ?? null,
                } as never);
                if (!error) existingSoll.add(dkey);
                else logs.push(`Riga ${r.excelRow}: sollecito ${error.message}`);
              }
            }
            if (r.note_legale && !openLegale.has(cid) && !clientsLegale.has(cid)) {
              const { error } = await supabaseAdmin.from("pratiche_legali" as never).insert({
                cliente_id: cid,
                tipo: "azione_legale_generica",
                stato: "aperta",
                note: r.note_legale,
                gestita_da: userId ?? null,
              } as never);
              if (!error) {
                openLegale.add(cid);
                clientsLegale.add(cid);
                legale.push(cid);
              } else logs.push(`Riga ${r.excelRow}: pratica legale ${error.message}`);
            }
          }
          return { c, u, s, logs, block, legale };
        });
        scadCreated += res.c;
        scadUpdated += res.u;
        scadSkipped += res.s;
        log.push(...res.logs);
        res.block.forEach((id) => clientsToBlock.add(id));
        res.legale.forEach((id) => clientsLegale.add(id));
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_elaborate: Math.min(i + BATCH, scadRows.length),
            righe_create: scadCreated,
            righe_aggiornate: scadUpdated,
            righe_errore: scadSkipped,
            stato: "in_elaborazione",
          })
          .eq("id", importazioneId);
      }

      if (clientsToBlock.size) {
        await supabaseAdmin
          .from("clienti")
          .update({
            bloccato: true,
            data_blocco: now,
            motivo_blocco: "Import scadenziario: T_BLOCCO=BLOCCATO",
          } as never)
          .in("id", Array.from(clientsToBlock));
      }

      // ASSICURAZIONI
      let assicCreated = 0,
        assicUpdated = 0,
        assicSkipped = 0;
      const assicClients = new Set<string>();
      const existingPol = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin
          .from("assicurazioni_credito" as never)
          .select("id, cliente_id")
          .in("cliente_id", clientIds);
        ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
          if (!existingPol.has(p.cliente_id)) existingPol.set(p.cliente_id, p.id);
        });
      }

      for (let i = 0; i < assicRows.length; i += BATCH) {
        const chunk = assicRows.slice(i, i + BATCH);
        const res = await step.run(`assic-batch-${i}`, async () => {
          let c = 0,
            u = 0,
            s = 0;
          const logs: string[] = [];
          const clients: string[] = [];
          for (const a of chunk) {
            const cid = clientMap.get(a.cod_cli);
            if (!cid) {
              s++;
              logs.push(`Assic riga ${a.excelRow}: cliente ${a.cod_cli} non trovato`);
              continue;
            }
            clients.push(cid);
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
              const { error } = await supabaseAdmin
                .from("assicurazioni_credito" as never)
                .update(payload as never)
                .eq("id", existId);
              if (error) {
                s++;
                logs.push(`Assic riga ${a.excelRow}: ${error.message}`);
              } else u++;
            } else {
              const { error } = await supabaseAdmin
                .from("assicurazioni_credito" as never)
                .insert(payload as never);
              if (error) {
                s++;
                logs.push(`Assic riga ${a.excelRow}: ${error.message}`);
              } else {
                c++;
                existingPol.set(cid, "new");
              }
            }
          }
          return { c, u, s, logs, clients };
        });
        assicCreated += res.c;
        assicUpdated += res.u;
        assicSkipped += res.s;
        log.push(...res.logs);
        res.clients.forEach((id) => assicClients.add(id));
      }

      if (assicClients.size) {
        await supabaseAdmin
          .from("clienti")
          .update({ assicurazione_attiva: true } as never)
          .in("id", Array.from(assicClients));
      }

      const summary = [
        `SCADENZIARIO: lette ${scadTot}, abbinati ${matchedClients.size} clienti, ${scadCreated} create, ${scadUpdated} aggiornate, ${scadSkipped} saltate`,
        `ASSICURAZIONI: lette ${assicRows.length}, ${assicCreated} create, ${assicUpdated} aggiornate, ${assicSkipped} saltate`,
        `Clienti bloccati: ${clientsToBlock.size}, pratiche legali create: ${clientsLegale.size}`,
      ];
      const fullLog = [...summary, ...log];

      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_elaborate: scadRows.length + assicRows.length,
          righe_create: scadCreated + assicCreated,
          righe_aggiornate: scadUpdated + assicUpdated,
          righe_errore: scadSkipped + assicSkipped,
          stato: scadSkipped + assicSkipped > 0 ? "completata_con_errori" : "completata",
          completata_at: new Date().toISOString(),
          log_errori: fullLog.length ? fullLog.slice(0, 500).map((m) => ({ messaggio: m })) : null,
        })
        .eq("id", importazioneId);

      return { scadCreated, scadUpdated, assicCreated, assicUpdated };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

/* ============================================================================
 * E — BLOCCO FIDO + ASSICURAZIONE (foglio BLOCCO_FIDO_ASSICURAZIONE)
 * ============================================================================ */

// (BFA_HEADER_MAP e bfaNormalize rimossi: ora si usa match esatto via COL_MAP_BLOCCO / COL_MAP_NOTE)


function bfaToNum(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bfaToInt(v: unknown): number | null {
  const n = bfaToNum(v);
  return n == null ? null : Math.trunc(n);
}
function bfaDateISO(v: unknown): string | null {
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

type BFARow = {
  riga: number;
  codice_gestionale: string;
  ind_blocco: number | null;
  ultima_data_fatturazione: string | null;
  fido: number | null;
  assicurazione: number | null;
};

// Mappe colonne ESATTE (case-insensitive, trim) richieste dalla spec
const COL_MAP_BLOCCO: Record<string, "cod_cli" | "ind_blocco" | "ultima_data_fatturazione" | "fido" | "assicurazione"> = {
  "cod_cli": "cod_cli",
  "ind_blocco": "ind_blocco",
  "ultima data fatturazione": "ultima_data_fatturazione",
  "fido": "fido",
  "assicurazione": "assicurazione",
};
const COL_MAP_NOTE: Record<string, "cod_cli" | "nota"> = {
  "cod_cli": "cod_cli",
  "note legale": "nota",
};

type AnomaliaImport = {
  importazione_id: string;
  cliente_id: string;
  codice_gestionale: string;
  ragione_sociale: string | null;
  tipo_anomalia: "perde_assicurazione" | "perde_gestione_legale" | "cambio_blocco";
  campo: string;
  valore_attuale: string | null;
  valore_nuovo: string | null;
  stato: "in_attesa";
};

export const processBloccoFidoImport = inngest.createFunction(
  {
    id: "process-blocco-fido-import",
    name: "Process blocco fido + assicurazione import",
    retries: 2,
    triggers: [{ event: "import/blocco_fido_assicurazione.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    try {
      // STEP 1: carica staging JSON (parsing fatto client-side, niente XLSX nel Worker)
      const parseResult = await step.run("load-staging", async () => {
        // filePath ora punta a "blocco-fido/{importazioneId}/manifest.json"
        const manifestPath = filePath;
        if (!manifestPath.endsWith("manifest.json")) {
          throw new Error(
            "Import legacy: il file Excel deve essere ri-caricato dalla UI per generare lo staging JSON",
          );
        }
        const baseDir = manifestPath.replace(/\/manifest\.json$/, "");

        const { data: manFile, error: manErr } = await supabaseAdmin.storage
          .from("import-files")
          .download(manifestPath);
        if (manErr || !manFile) throw new Error(`Download manifest fallito: ${manErr?.message ?? "no data"}`);
        const manifest = JSON.parse(await manFile.text()) as {
          kind: string;
          totaleBlocco: number;
          totaleNote: number;
          foglioNotePresente: boolean;
          chunkSize: number;
          totalChunks: number;
          warnings?: string[];
        };

        // Scarica tutti i chunk BLOCCO (sono JSON leggeri, max 500 righe ognuno)
        const rows: BFARow[] = [];
        for (let ci = 0; ci < manifest.totalChunks; ci++) {
          const path = `${baseDir}/blocco-chunk-${ci}.json`;
          const { data: chunkFile, error: chunkErr } = await supabaseAdmin.storage
            .from("import-files")
            .download(path);
          if (chunkErr || !chunkFile) throw new Error(`Download chunk ${ci} fallito: ${chunkErr?.message ?? "no data"}`);
          const chunk = JSON.parse(await chunkFile.text()) as Array<{
            cod_cli: string;
            ind_blocco: number | null;
            ultima_data_fatturazione: string | null;
            fido: number | null;
            assicurazione: number | null;
          }>;
          chunk.forEach((r, idx) => {
            rows.push({
              riga: ci * manifest.chunkSize + idx + 2,
              codice_gestionale: String(r.cod_cli),
              ind_blocco: r.ind_blocco,
              ultima_data_fatturazione: r.ultima_data_fatturazione,
              fido: r.fido,
              assicurazione: r.assicurazione,
            });
          });
        }

        // Scarica note legali
        const noteLegali: Array<{ cod_cli: string; nota: string }> = [];
        if (manifest.foglioNotePresente && manifest.totaleNote > 0) {
          const { data: noteFile, error: noteErr } = await supabaseAdmin.storage
            .from("import-files")
            .download(`${baseDir}/note-legali.json`);
          if (noteErr || !noteFile) throw new Error(`Download note-legali fallito: ${noteErr?.message ?? "no data"}`);
          const noteRaw = JSON.parse(await noteFile.text()) as Array<{ cod_cli: string; nota: string }>;
          for (const n of noteRaw) {
            if (n.cod_cli && n.nota) noteLegali.push({ cod_cli: String(n.cod_cli), nota: String(n.nota) });
          }
        }

        const warnings: Array<{ riga: number; errore: string }> = (manifest.warnings ?? []).map(
          (w) => ({ riga: 0, errore: w }),
        );
        return {
          rows,
          noteLegali,
          noteSheetFound: manifest.foglioNotePresente,
          noteHeaderOk: manifest.foglioNotePresente && manifest.totaleNote > 0,
          warnings,
        };
      });

      const parsed = parseResult.rows;
      const noteLegaliFromSheet = parseResult.noteLegali;
      const initialWarnings = parseResult.warnings;
      const timestampInizio = new Date().toISOString();

      logger.info(
        `Blocco fido (staging): ${parsed.length} righe, ${noteLegaliFromSheet.length} note legali`,
      );
      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_totali: parsed.length,
          righe_elaborate: 0,
          righe_aggiornate: 0,
          righe_create: 0,
          righe_errore: 0,
          righe_saltate: 0,
          stato: "in_elaborazione",
        })
        .eq("id", importazioneId);

      if (initialWarnings.length) {
        await supabaseAdmin
          .from("importazioni")
          .update({ log_errori: initialWarnings as never } as never)
          .eq("id", importazioneId);
      }

      if (!parsed.length) {
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato: "completata_con_errori",
            completata_at: new Date().toISOString(),
            log_errori: [{ riga: 0, errore: "Nessuna riga da processare" }],
          })
          .eq("id", importazioneId);
        return { rows: 0 };
      }


      // STEP 2: lookup cliente + STATO ATTUALE (per anomalie)
      const codici = Array.from(new Set(parsed.map((r) => r.codice_gestionale)));
      type ClienteSnap = {
        id: string;
        ragione_sociale: string | null;
        ind_blocco: number | null;
        assicurazione_attiva: boolean | null;
        in_gestione_legale: boolean | null;
      };
      const clientMap = await step.run("lookup-clienti", async () => {
        const map: Record<string, ClienteSnap> = {};
        const BATCH = 500;
        for (let i = 0; i < codici.length; i += BATCH) {
          const slice = codici.slice(i, i + BATCH);
          const { data } = await supabaseAdmin
            .from("clienti")
            .select("id, codice_gestionale, ragione_sociale, ind_blocco, assicurazione_attiva, in_gestione_legale")
            .in("codice_gestionale", slice);
          (data ?? []).forEach((c) => {
            if (c.codice_gestionale) {
              map[c.codice_gestionale] = {
                id: c.id,
                ragione_sociale: c.ragione_sociale ?? null,
                ind_blocco: (c as { ind_blocco?: number | null }).ind_blocco ?? null,
                assicurazione_attiva: (c as { assicurazione_attiva?: boolean | null }).assicurazione_attiva ?? null,
                in_gestione_legale: (c as { in_gestione_legale?: boolean | null }).in_gestione_legale ?? null,
              };
            }
          });
        }
        return map;
      });

      // STEP 3: pre-fetch polizze POUEY esistenti
      const allClienteIds = Array.from(
        new Set(parsed.map((r) => clientMap[r.codice_gestionale]?.id).filter(Boolean) as string[]),
      );
      const poueyMap = await step.run("lookup-polizze", async () => {
        const map: Record<string, string> = {};
        const BATCH = 500;
        for (let i = 0; i < allClienteIds.length; i += BATCH) {
          const slice = allClienteIds.slice(i, i + BATCH);
          const { data } = await supabaseAdmin
            .from("assicurazioni_credito")
            .select("id, cliente_id")
            .eq("assicuratore", "POUEY")
            .in("cliente_id", slice);
          ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
            map[p.cliente_id] = p.id;
          });
        }
        return map;
      });

      // STEP 4: chunk processing con anomalie
      const CHUNK = 500;
      const cutoff2025 = "2025-01-01";
      const nowIso = new Date().toISOString();
      const errors: Array<{ riga: number; errore: string }> = [];
      const nonTrovati: string[] = [];
      let aggiornati = 0;
      let bloccati = 0;
      let sbloccati = 0;
      let nonAttivi = 0;
      let polizze = 0;
      let anomalieTotali = 0;

      const totalChunks = Math.ceil(parsed.length / CHUNK);
      for (let ci = 0; ci < totalChunks; ci++) {
        const slice = parsed.slice(ci * CHUNK, (ci + 1) * CHUNK);
        const chunkRes = await step.run(`chunk-${ci}`, async () => {
          let cAgg = 0, cBlk = 0, cSblk = 0, cNonAtt = 0, cPol = 0, cAnom = 0;
          const cErr: Array<{ riga: number; errore: string }> = [];
          const cMiss: string[] = [];
          const anomalieBatch: AnomaliaImport[] = [];

          await Promise.all(
            slice.map(async (r) => {
              const snap = clientMap[r.codice_gestionale];
              if (!snap) {
                cMiss.push(r.codice_gestionale);
                return;
              }
              const clienteId = snap.id;
              const payload: Record<string, unknown> = {};
              const rowAnomalie: AnomaliaImport[] = [];

              // --- Anomalia: cambio blocco ---
              const indNuovo = r.ind_blocco;
              const indAttuale = snap.ind_blocco ?? 0;
              let bloccoAnomalo = false;
              if (indNuovo != null && indNuovo !== indAttuale) {
                rowAnomalie.push({
                  importazione_id: importazioneId,
                  cliente_id: clienteId,
                  codice_gestionale: r.codice_gestionale,
                  ragione_sociale: snap.ragione_sociale,
                  tipo_anomalia: "cambio_blocco",
                  campo: "ind_blocco",
                  valore_attuale: String(indAttuale),
                  valore_nuovo: String(indNuovo),
                  stato: "in_attesa",
                });
                bloccoAnomalo = true;
              }
              if (!bloccoAnomalo && indNuovo != null) {
                if (indNuovo === 0) {
                  payload.bloccato = false;
                  payload.ind_blocco = 0;
                  payload.motivo_blocco = null;
                  payload.data_blocco = null;
                  cSblk++;
                } else if (indNuovo === 1) {
                  payload.bloccato = true;
                  payload.ind_blocco = 1;
                  payload.motivo_blocco = "Bloccato con possibilità di sblocco";
                  payload.data_blocco = nowIso;
                  cBlk++;
                } else if (indNuovo === 2) {
                  payload.bloccato = true;
                  payload.ind_blocco = 2;
                  payload.motivo_blocco = "Bloccato";
                  payload.data_blocco = nowIso;
                  cBlk++;
                }
              }

              // --- Sempre aggiornati ---
              payload.ultima_data_fatturazione = r.ultima_data_fatturazione;
              const attivo =
                r.ultima_data_fatturazione != null &&
                r.ultima_data_fatturazione >= cutoff2025;
              payload.cliente_attivo = attivo;
              if (!attivo) cNonAtt++;

              // Fido: azzera anche se 0
              if (r.fido !== null && r.fido !== undefined) {
                payload.fido_gestionale = r.fido ?? 0;
              }

              // --- Anomalia: perde_assicurazione ---
              const nuovaAssic =
                r.assicurazione !== null && r.assicurazione !== undefined && r.assicurazione > 0;
              let assicAnomalo = false;
              if (snap.assicurazione_attiva === true && !nuovaAssic) {
                rowAnomalie.push({
                  importazione_id: importazioneId,
                  cliente_id: clienteId,
                  codice_gestionale: r.codice_gestionale,
                  ragione_sociale: snap.ragione_sociale,
                  tipo_anomalia: "perde_assicurazione",
                  campo: "assicurazione_attiva",
                  valore_attuale: "true",
                  valore_nuovo: "false",
                  stato: "in_attesa",
                });
                assicAnomalo = true;
              }

              if (!assicAnomalo) {
                if (nuovaAssic) {
                  payload.assicurazione_attiva = true;
                  const existingId = poueyMap[clienteId];
                  if (existingId) {
                    const { error } = await supabaseAdmin
                      .from("assicurazioni_credito")
                      .update({
                        importo_massimale: r.assicurazione,
                        stato: "attiva",
                      } as never)
                      .eq("id", existingId);
                    if (error) cErr.push({ riga: r.riga, errore: `polizza update: ${error.message}` });
                    else cPol++;
                  } else {
                    const { data: ins, error } = await supabaseAdmin
                      .from("assicurazioni_credito")
                      .insert({
                        cliente_id: clienteId,
                        assicuratore: "POUEY",
                        importo_massimale: r.assicurazione,
                        stato: "attiva",
                      } as never)
                      .select("id")
                      .single();
                    if (error) cErr.push({ riga: r.riga, errore: `polizza insert: ${error.message}` });
                    else {
                      cPol++;
                      if (ins?.id) poueyMap[clienteId] = ins.id;
                    }
                  }
                } else {
                  // assicurazione attualmente false e file dice no → coerente
                  payload.assicurazione_attiva = false;
                }
              }

              // Marca ultima_importazione_d
              payload.ultima_importazione_d = timestampInizio;

              if (Object.keys(payload).length > 0) {
                const { error } = await supabaseAdmin
                  .from("clienti")
                  .update(payload as never)
                  .eq("id", clienteId);
                if (error) cErr.push({ riga: r.riga, errore: error.message });
                else cAgg++;
              }

              if (rowAnomalie.length) {
                anomalieBatch.push(...rowAnomalie);
                cAnom += rowAnomalie.length;
              }
            }),
          );

          if (anomalieBatch.length) {
            const { error } = await supabaseAdmin
              .from("anomalie_import" as never)
              .insert(anomalieBatch as never);
            if (error) cErr.push({ riga: 0, errore: `anomalie insert: ${error.message}` });
          }

          await supabaseAdmin.rpc("increment_importazione_counters", {
            _id: importazioneId,
            _elaborate: slice.length,
            _create: 0,
            _update: cAgg,
            _error: cErr.length,
            _skipped: cMiss.length,
          });

          if (cErr.length || cMiss.length) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori, codici_mancanti")
              .eq("id", importazioneId)
              .single();
            const updates: Record<string, unknown> = {};
            if (cErr.length) {
              const exist = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
              updates.log_errori = [...exist, ...cErr].slice(0, 500);
            }
            if (cMiss.length) {
              const exist = (cur?.codici_mancanti as string[] | null) ?? [];
              updates.codici_mancanti = Array.from(new Set([...exist, ...cMiss])).slice(0, 500);
            }
            await supabaseAdmin
              .from("importazioni")
              .update(updates as never)
              .eq("id", importazioneId);
          }

          return { cAgg, cBlk, cSblk, cNonAtt, cPol, cAnom, cErr, cMiss };
        });
        aggiornati += chunkRes.cAgg;
        bloccati += chunkRes.cBlk;
        sbloccati += chunkRes.cSblk;
        nonAttivi += chunkRes.cNonAtt;
        polizze += chunkRes.cPol;
        anomalieTotali += chunkRes.cAnom;
        errors.push(...chunkRes.cErr);
        nonTrovati.push(...chunkRes.cMiss);
      }

      // STEP 4b: Note Legale + anomalie perde_gestione_legale
      let noteImportate = 0;
      let noteNonTrovate = 0;
      let perdeGestioneLegale = 0;

      await step.run("note-legali", async () => {
        try {
          // Lookup arricchimento clientMap per note con codici nuovi
          const missCodes = noteLegaliFromSheet
            .map((n) => n.cod_cli)
            .filter((c) => !clientMap[c]);
          if (missCodes.length) {
            const uniqMiss = Array.from(new Set(missCodes));
            const BATCH = 500;
            for (let i = 0; i < uniqMiss.length; i += BATCH) {
              const slice = uniqMiss.slice(i, i + BATCH);
              const { data } = await supabaseAdmin
                .from("clienti")
                .select("id, codice_gestionale, ragione_sociale, ind_blocco, assicurazione_attiva, in_gestione_legale")
                .in("codice_gestionale", slice);
              (data ?? []).forEach((c) => {
                if (c.codice_gestionale) {
                  clientMap[c.codice_gestionale] = {
                    id: c.id,
                    ragione_sociale: c.ragione_sociale ?? null,
                    ind_blocco: (c as { ind_blocco?: number | null }).ind_blocco ?? null,
                    assicurazione_attiva: (c as { assicurazione_attiva?: boolean | null }).assicurazione_attiva ?? null,
                    in_gestione_legale: (c as { in_gestione_legale?: boolean | null }).in_gestione_legale ?? null,
                  };
                }
              });
            }
          }

          const classificaCategoria = (testo: string): string => {
            const t = testo.toLowerCase();
            if (/\bd\.?\s*i\.?\b|decreto ingiuntivo|ricorso/.test(t)) return "Decreto Ingiuntivo";
            if (/pignoramento/.test(t)) return "Pignoramento";
            if (/sollecito/.test(t)) return "Sollecito Legale";
            if (/pouey|sinistro/.test(t)) return "POUEY / Assicurazione";
            if (/piano di rientro/.test(t)) return "Piano di Rientro";
            if (/fallito|messa a perdita/.test(t)) return "Messa a Perdita";
            return "Altro";
          };

          const clientiInGestioneNuovi = new Set<string>();
          const upserts: Array<Record<string, unknown>> = [];
          for (const { cod_cli, nota } of noteLegaliFromSheet) {
            const snap = clientMap[cod_cli];
            if (!snap) {
              noteNonTrovate++;
              continue;
            }
            upserts.push({
              cliente_id: snap.id,
              testo: nota,
              categoria: classificaCategoria(nota),
              importato_da: importazioneId,
              ultima_sincronizzazione: new Date().toISOString(),
            });
            clientiInGestioneNuovi.add(snap.id);
            noteImportate++;
          }

          // Upsert su UNIQUE(cliente_id)
          if (upserts.length) {
            const BATCH = 500;
            for (let i = 0; i < upserts.length; i += BATCH) {
              const batch = upserts.slice(i, i + BATCH);
              const { error } = await supabaseAdmin
                .from("note_legali_gestionali" as never)
                .upsert(batch as never, { onConflict: "cliente_id" });
              if (error) errors.push({ riga: 0, errore: `note upsert: ${error.message}` });
            }
          }

          // Imposta in_gestione_legale = true sui nuovi
          if (clientiInGestioneNuovi.size) {
            const ids = Array.from(clientiInGestioneNuovi);
            const BATCH = 500;
            for (let i = 0; i < ids.length; i += BATCH) {
              await supabaseAdmin
                .from("clienti")
                .update({ in_gestione_legale: true } as never)
                .in("id", ids.slice(i, i + BATCH));
            }
          }

          // Anomalie perde_gestione_legale: clienti nel file con in_gestione_legale=true
          // ma NON presenti nel foglio Note Legale
          const anomaliePerdita: AnomaliaImport[] = [];
          for (const codCli of codici) {
            const snap = clientMap[codCli];
            if (!snap) continue;
            if (snap.in_gestione_legale === true && !clientiInGestioneNuovi.has(snap.id)) {
              anomaliePerdita.push({
                importazione_id: importazioneId,
                cliente_id: snap.id,
                codice_gestionale: codCli,
                ragione_sociale: snap.ragione_sociale,
                tipo_anomalia: "perde_gestione_legale",
                campo: "in_gestione_legale",
                valore_attuale: "true",
                valore_nuovo: "false",
                stato: "in_attesa",
              });
            }
          }
          if (anomaliePerdita.length) {
            const { error } = await supabaseAdmin
              .from("anomalie_import" as never)
              .insert(anomaliePerdita as never);
            if (error) errors.push({ riga: 0, errore: `anomalie perde_gestione: ${error.message}` });
            else {
              perdeGestioneLegale = anomaliePerdita.length;
              anomalieTotali += anomaliePerdita.length;
            }
          }

          logger.info(
            `Note Legale: ${noteImportate} importate, ${noteNonTrovate} non trovate, ${perdeGestioneLegale} anomalie perde_gestione`,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`Note Legale errore: ${msg}`);
          errors.push({ riga: 0, errore: `Errore note legali: ${msg}` });
        }
      });

      // STEP 5: azzeramento clienti assenti dal file
      let azzerati = 0;
      await step.run("azzera-assenti", async () => {
        const { data: assenti } = await supabaseAdmin
          .from("clienti")
          .select("id")
          .not("ultima_importazione_d", "is", null)
          .lt("ultima_importazione_d", timestampInizio);

        const ids = ((assenti ?? []) as Array<{ id: string }>).map((c) => c.id);
        if (!ids.length) return;

        const BATCH = 200;
        for (let i = 0; i < ids.length; i += BATCH) {
          const slice = ids.slice(i, i + BATCH);
          const { error } = await supabaseAdmin
            .from("clienti")
            .update({
              ind_blocco: 0,
              bloccato: false,
              motivo_blocco: null,
              data_blocco: null,
              assicurazione_attiva: false,
              in_gestione_legale: false,
              ultima_importazione_d: null,
            } as never)
            .in("id", slice);
          if (error) {
            errors.push({ riga: 0, errore: `azzera-assenti: ${error.message}` });
            continue;
          }
          await supabaseAdmin
            .from("note_legali_gestionali" as never)
            .delete()
            .in("cliente_id", slice);
          azzerati += slice.length;
        }
      });

      // STEP 6: stato finale + log riepilogo
      await step.run("finalize", async () => {
        const summary = [
          {
            riga: 0,
            errore: `Riepilogo: ${aggiornati} aggiornati, ${azzerati} azzerati (assenti), ${anomalieTotali} anomalie in attesa, ${nonTrovati.length + noteNonTrovate} non trovati, ${errors.length} errori`,
          },
          {
            riga: 0,
            errore: `Dettaglio: ${bloccati} bloccati, ${sbloccati} sbloccati, ${nonAttivi} non attivi, ${polizze} polizze POUEY, ${noteImportate} note legali`,
          },
        ];
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori")
          .eq("id", importazioneId)
          .single();
        const existing = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato: errors.length > 0 ? "completata_con_errori" : "completata",
            completata_at: new Date().toISOString(),
            log_errori: [...summary, ...existing].slice(0, 500),
          } as never)
          .eq("id", importazioneId);
      });

      logger.info(
        `Blocco fido done: agg=${aggiornati}, azzerati=${azzerati}, anom=${anomalieTotali}, blk=${bloccati}, sblk=${sbloccati}, nonAtt=${nonAttivi}, pol=${polizze}, noteLeg=${noteImportate}, miss=${nonTrovati.length}, err=${errors.length}`,
      );
      return {
        aggiornati,
        azzerati,
        anomalie: anomalieTotali,
        bloccati,
        sbloccati,
        nonAttivi,
        polizze,
        noteImportate,
        noteNonTrovate,
        perdeGestioneLegale,
        nonTrovati: nonTrovati.length,
        errori: errors.length,
      };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

