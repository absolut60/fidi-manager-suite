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

async function downloadWorkbook(filePath: string) {
  const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
  if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: false });
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
  const { data: file, error } = await supabaseAdmin.storage
    .from("import-files")
    .download(filePath);
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
        const timestampInizio = await step.run(
          "init-timestamp",
          async () => new Date().toISOString(),
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
      const timestampInizio = await step.run(
        "init-timestamp",
        async () => new Date().toISOString(),
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
      for (const r of rows) {
        const cid = clientMap[r.codice_gestionale];
        if (!cid) {
          rowErrs.push({
            riga: r.idx,
            errore: `Cliente ${r.codice_gestionale} non trovato${r.ragione_sociale ? ` (${r.ragione_sociale})` : ""}`,
          });
          continue;
        }
        matched.push(cid);
        rawValidRows.push({
          ...r.payload,
          cliente_id: cid,
          importato_da: userId ?? null,
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
        const { error: upErr, count } = await (
          supabaseAdmin.from("scadenze" as never) as never as {
            upsert: (
              rows: unknown,
              opts: { onConflict: string; ignoreDuplicates: boolean },
            ) => {
              select: (
                cols: string,
                opts: { count: "exact" },
              ) => Promise<{ error: { message: string } | null; count: number | null }>;
            };
          }
        )
          .upsert(validRows, {
            onConflict: "cliente_id,numero_documento,sezionale,anno_partita",
            ignoreDuplicates: false,
          })
          .select("id", { count: "exact" });
        if (upErr) {
          batchErrs.push({
            riga: chunkIndex,
            errore: `Upsert chunk ${chunkIndex}: ${upErr.message}`,
          });
        } else {
          for (const key of validKeys) {
            if (existingKeys.has(key)) u++;
            else c++;
          }
          if ((count ?? 0) === 0 && validRows.length > 0) {
            batchErrs.push({
              riga: chunkIndex,
              errore: `Chunk ${chunkIndex}: 0 righe scritte su ${validRows.length}`,
            });
          }
        }
      }

      return {
        created: c,
        updated: u,
        elaborate: rows.length + missing.length,
        rowErrs,
        batchErrs,
        matchedCids: Array.from(new Set(matched)),
      };
    });

    // STEP D: incremento atomico contatori + raccogli cid abbinati
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
      });
      if (rpcErr) throw new Error(`increment_importazione_counters: ${rpcErr.message}`);

      // Append errori al log (best-effort)
      if (result.rowErrs.length || result.batchErrs.length) {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori")
          .eq("id", importazioneId)
          .single();
        const existing =
          ((cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? []);
        const next = [...existing, ...result.batchErrs, ...result.rowErrs].slice(0, 500);
        await supabaseAdmin
          .from("importazioni")
          .update({ log_errori: next } as never)
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
        const existing =
          ((cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? []);
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
              importato_da: userId ?? null,
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
