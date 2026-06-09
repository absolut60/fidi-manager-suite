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
      // Parse fuori da step.run: l'output di step.run è limitato a ~4MB
      // e un workbook parsato eccede facilmente quel limite.
      // In caso di retry il file viene ri-scaricato e ri-parsato (accettabile).
      const wb = await downloadWorkbook(filePath);
      const rows = anagraficaSheetToObjects(wb.Sheets[wb.SheetNames[0]]);
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
      // Lookup inline — senza step.run per evitare serializzazione della map grande
      const existing: Record<string, string> = {};
      {
        const CHUNK = 200;
        if (codici.length) {
          for (let i = 0; i < codici.length; i += CHUNK) {
            const slice = codici.slice(i, i + CHUNK);
            const { data } = await supabaseAdmin
              .from("clienti")
              .select("id, codice_gestionale")
              .in("codice_gestionale", slice)
              .limit(CHUNK + 10);
            (data ?? []).forEach((c) => {
              if (c.codice_gestionale) existing[`cg:${c.codice_gestionale}`] = c.id;
            });
          }
        }
        if (pive.length) {
          for (let i = 0; i < pive.length; i += CHUNK) {
            const slice = pive.slice(i, i + CHUNK);
            const { data } = await supabaseAdmin
              .from("clienti")
              .select("id, partita_iva")
              .in("partita_iva", slice)
              .limit(CHUNK + 10);
            (data ?? []).forEach((c) => {
              if (c.partita_iva) existing[`pi:${c.partita_iva}`] = c.id;
            });
          }
        }
      }

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
        const MACRO_LOOKUP: Record<string, string> = {
          "01": "IMPRESE EDILI", "02": "PRIVATI", "03": "DIPENDENTI",
          "04": "AZIENDA", "N/D": "Altre macrocategorie",
        };
        const CAT_LOOKUP: Record<string, string> = {
          "01": "IMPRESE Categoria A", "02": "IMPRESE Categoria B",
          "03": "IMPRESE Categoria C", "N/D": "Altre categorie",
        };
        const codMacro = toStr(r.codice_macrocategoria);
        const macroLabel = toStr(r.macrocategoria) || (codMacro && MACRO_LOOKUP[codMacro]) || null;
        const codCat = toStr(r.codice_categoria);
        const catLabel = toStr(r.categoria) || (codCat && CAT_LOOKUP[codCat]) || null;
        const addIfPresent = (p: Record<string, unknown>, key: string, value: unknown) => {
          if (value !== null && value !== undefined && String(value).trim() !== "") {
            p[key] = value;
          }
        };
        const payload: Record<string, unknown> = {
          ragione_sociale: r.ragione_sociale,
        };
        addIfPresent(payload, "codice_gestionale", toStr(r.codice_gestionale));
        addIfPresent(payload, "partita_iva", toStr(r.partita_iva));
        addIfPresent(payload, "codice_fiscale", toStr(r.codice_fiscale));
        if (r.forma_giuridica) {
          const ts = String(r.forma_giuridica).trim().toLowerCase();
          const validValues = ["persona_fisica", "azienda"];
          let normalized = ts.replace(/\s+/g, "_");
          if (ts === "persona fisica") normalized = "persona_fisica";
          if (ts === "ditta individuale") normalized = "persona_fisica";
          if (ts === "privato" || ts === "privati") normalized = "persona_fisica";
          if (!validValues.includes(normalized)) normalized = "azienda";
          addIfPresent(payload, "tipo_soggetto", normalized);
        }
        addIfPresent(payload, "indirizzo", toStr(r.indirizzo));
        addIfPresent(payload, "citta", toStr(r.citta));
        addIfPresent(payload, "cap", toStr(r.cap));
        addIfPresent(payload, "provincia", toStr(r.provincia));
        addIfPresent(payload, "telefono", toStr(r.telefono));
        addIfPresent(payload, "telefono_2", toStr(r.telefono_2));
        addIfPresent(payload, "cellulare", toStr((r as Record<string, unknown>).cellulare));
        addIfPresent(payload, "email", toStr(r.email));
        addIfPresent(payload, "pec", toStr(r.pec));
        addIfPresent(payload, "codice_sdi", toStr(r.codice_sdi));
        addIfPresent(payload, "note", toStr(r.note));
        addIfPresent(payload, "codice_macrocategoria", codMacro);
        addIfPresent(payload, "macrocategoria", macroLabel);
        addIfPresent(payload, "codice_categoria", codCat);
        addIfPresent(payload, "categoria", catLabel);
        addIfPresent(payload, "condizione_pagamento_cod", toStr((r as Record<string, unknown>).condizione_pagamento_cod));
        addIfPresent(payload, "condizione_pagamento_desc", toStr((r as Record<string, unknown>).condizione_pagamento_desc));
        addIfPresent(payload, "condizioni_pagamento", toStr((r as Record<string, unknown>).condizione_pagamento_desc) || toStr((r as Record<string, unknown>).condizioni_pagamento));

        if (storeId) payload.store_id = storeId;
        const existId =
          (r.codice_gestionale && existing[`cg:${r.codice_gestionale}`]) ||
          (r.partita_iva && existing[`pi:${r.partita_iva}`]) ||
          null;
        prepared.push({ idx: r.__row, payload, existId });
      }

      const toInsert = prepared.filter((p) => !p.existId);
      const toUpdate = prepared.filter((p) => p.existId);

      // UN SOLO step.run per tutti gli insert
      const insertRes = await step.run("process-all-inserts", async () => {
        const BATCH = 500;
        let ok = 0;
        const errs: Array<{ riga: number; errore: string }> = [];
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const chunk = toInsert.slice(i, i + BATCH);
          const { data, error } = await supabaseAdmin
            .from("clienti")
            .insert(chunk.map((c) => c.payload) as never)
            .select("id");
          if (error) {
            for (const c of chunk) {
              const { error: e2 } = await supabaseAdmin.from("clienti").insert(c.payload as never);
              if (e2) errs.push({ riga: c.idx, errore: `Insert: ${e2.message}` });
              else ok++;
            }
          } else {
            ok += data?.length ?? chunk.length;
          }
          await update("in_elaborazione");
        }
        return { ok, errs };
      });
      created += insertRes.ok;
      errorLog.push(...insertRes.errs);

      // UN SOLO step.run per tutti gli update
      const updateRes = await step.run("process-all-updates", async () => {
        const BATCH = 500;
        let ok = 0;
        const errs: Array<{ riga: number; errore: string }> = [];
        for (let i = 0; i < toUpdate.length; i += BATCH) {
          const chunk = toUpdate.slice(i, i + BATCH);
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
          await update("in_elaborazione");
        }
        return { ok, errs };
      });
      updated += updateRes.ok;
      errorLog.push(...updateRes.errs);

      await update(errorLog.length ? "completata_con_errori" : "completata", true);
      return { ok: true, creati: created, aggiornati: updated, saltati: skipped, errori: errorLog.length };
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
      // Parse fuori da step.run: output limitato a ~4MB
      const wb = await downloadWorkbook(filePath);
      const { rows, missing } = parseRischioSheet(wb.Sheets[wb.SheetNames[0]]);
      logger.info(`Rischio: ${rows.length} righe, ${missing.length} senza codice`);

      // Errori iniziali (codice mancante) persistiti direttamente
      let cErrori = missing.length;
      let cAggiornati = 0;
      let cSaltati = 0;

      await supabaseAdmin
        .from("importazioni")
        .update({
          righe_totali: rows.length + missing.length,
          righe_errore: cErrori,
          stato: "in_elaborazione",
          log_errori: missing.length
            ? missing.slice(0, 500).map((idx) => ({
                riga: idx,
                errore: "Codice gestionale mancante",
              }))
            : null,
        })
        .eq("id", importazioneId);

      // Lookup: SOLO Record<codice, UUID>
      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      // Lookup inline — senza step.run per evitare serializzazione della map grande
      const lookup: Record<string, string> = {};
      {
        const CHUNK = 200;
        for (let i = 0; i < codici.length; i += CHUNK) {
          const slice = codici.slice(i, i + CHUNK);
          if (!slice.length) continue;
          const { data } = await supabaseAdmin
            .from("clienti")
            .select("id, codice_gestionale")
            .in("codice_gestionale", slice)
            .limit(CHUNK + 10);
          (data ?? []).forEach((c) => {
            if (c.codice_gestionale) lookup[c.codice_gestionale] = c.id;
          });
        }
      }

      const now = new Date().toISOString();
      // UN SOLO step.run per tutti i batch — Inngest memoizza solo l'output finale
      const allRes = await step.run("process-all-batches", async () => {
        let aggiornati = 0;
        let saltati = 0;
        let errori = 0;
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const errs: Array<{ riga: number; errore: string }> = [];
          let bOk = 0;
          let bSaltati = 0;
          let bErrori = 0;
          await Promise.all(
            chunk.map(async (r) => {
              const id = lookup[r.codice_gestionale];
              if (!id) {
                bSaltati++;
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
              if (error) {
                bErrori++;
                errs.push({ riga: r.idx, errore: `Update: ${error.message}` });
              } else bOk++;
            }),
          );
          aggiornati += bOk;
          saltati += bSaltati;
          errori += bErrori;
          if (errs.length) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori")
              .eq("id", importazioneId)
              .single();
            const existing =
              (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
            await supabaseAdmin
              .from("importazioni")
              .update({ log_errori: [...existing, ...errs].slice(0, 500) } as never)
              .eq("id", importazioneId);
          }
          await supabaseAdmin
            .from("importazioni")
            .update({
              righe_elaborate: Math.min(i + BATCH, rows.length),
              righe_aggiornate: aggiornati,
              righe_errore: errori + saltati,
              stato: "in_elaborazione",
            })
            .eq("id", importazioneId);
        }
        return { aggiornati, saltati, errori };
      });
      cAggiornati = allRes.aggiornati;
      cSaltati = allRes.saltati;
      cErrori += allRes.errori + allRes.saltati;

      const riepilogoLog: Array<{ riga: number; errore: string }> = [
        {
          riga: 0,
          errore: `Riepilogo: ${cAggiornati} aggiornati, ${cSaltati} saltati, ${cErrori} errori`,
        },
      ];

      // Calcola fuori dallo step — solo primitivi, nessun array grande catturato nella closure
      const totaleElaborate = rows.length + missing.length;
      const logFinale = riepilogoLog.slice(0, 50);
      const statoFinale = cErrori > 0 ? "completata_con_errori" : "completata";

      await step.run("finalize", async () => {
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_elaborate: totaleElaborate,
            righe_create: 0,
            righe_aggiornate: cAggiornati,
            righe_errore: cErrori,
            stato: statoFinale,
            completata_at: new Date().toISOString(),
            log_errori: logFinale,
          } as never)
          .eq("id", importazioneId);
        return { ok: true };
      });

      // SOLO contatori e log troncato — nessun array di righe/clienti
      return {
        ok: true,
        aggiornati: cAggiornati,
        saltati: cSaltati,
        errori: cErrori,
        log: riepilogoLog.slice(0, 300),
      };
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
        const SEND_BATCH = 500;
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
      const SEND_BATCH = 500;
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
    // Lookup inline — senza step.run per evitare serializzazione della map grande
    const clientMap: Record<string, string> = {};
    {
      const BATCH = 500;
      for (let i = 0; i < codici.length; i += BATCH) {
        const slice = codici.slice(i, i + BATCH);
        if (!slice.length) continue;
        const { data: cdata } = await supabaseAdmin
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", slice as string[]);
        (cdata ?? []).forEach((c) => {
          if (c.codice_gestionale) clientMap[c.codice_gestionale] = c.id;
        });
      }
    }

    // STEP C: prepara, deduplica, upsert + persisti errori/codici inline
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
          for (const key of validKeys) {
            if (existingKeys.has(key)) u++;
            else c++;
          }
        }
      }

      // Persisti errori/codici mancanti inline (NON ritornati come array)
      const totalErrs = rowErrs.length + batchErrs.length;
      const skippedCodesArr = Array.from(skippedCodes);
      if (rowErrs.length || batchErrs.length || skippedCodesArr.length) {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori, codici_mancanti")
          .eq("id", importazioneId)
          .single();
        const updates: Record<string, unknown> = {};
        if (rowErrs.length || batchErrs.length) {
          const existing =
            (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
          updates.log_errori = [...existing, ...batchErrs, ...rowErrs].slice(0, 500);
        }
        if (skippedCodesArr.length) {
          const existingCodes = (cur?.codici_mancanti as string[] | null) ?? [];
          updates.codici_mancanti = Array.from(
            new Set([...existingCodes, ...skippedCodesArr]),
          ).slice(0, 200);
        }
        await supabaseAdmin
          .from("importazioni")
          .update(updates as never)
          .eq("id", importazioneId);
      }

      // SOLO contatori
      return {
        created: c,
        updated: u,
        elaborate: rows.length + missing.length,
        skipped,
        errori: totalErrs,
      };
    });

    // STEP D: incremento atomico contatori (errori/codici già persistiti)
    const progress = await step.run("increment-counters", async () => {
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
        _error: result.errori,
        _skipped: result.skipped,
      });
      if (rpcErr) throw new Error(`increment_importazione_counters: ${rpcErr.message}`);
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

    // SOLO contatori
    return {
      chunkIndex,
      created: result.created,
      updated: result.updated,
      elaborate: result.elaborate,
      skipped: result.skipped,
      errori: result.errori,
      chunks_completati: progress.chunks_completati,
      chunks_totali: progress.chunks_totali,
    };
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
      // Parse fuori da step.run: workbook può eccedere il limite ~4MB
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
      let matchedClientsCount = 0;
      let clientsToBlockCount = 0;
      let clientsLegaleCount = 0;
      const now = new Date().toISOString();


      // UN SOLO step.run per tutti i batch scadenziario
      const scadAllRes = await step.run("process-all-scad-batches", async () => {
        const BATCH = 500;
        let totC = 0,
          totU = 0,
          totS = 0;
        let totBlocked = 0,
          totLegale = 0,
          totMatched = 0;
        for (let i = 0; i < scadRows.length; i += BATCH) {
          const chunk = scadRows.slice(i, i + BATCH);
          let c = 0,
            u = 0,
            s = 0;
          const logs: string[] = [];
          const block = new Set<string>();
          const legale = new Set<string>();
          const matched = new Set<string>();
          for (const r of chunk) {
            const cid = clientMap.get(r.cod_cli);
            if (!cid) {
              s++;
              logs.push(`Riga ${r.excelRow}: cliente ${r.cod_cli} non trovato`);
              continue;
            }
            matched.add(cid);
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
            if (r.bloccato) block.add(cid);
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
            if (r.note_legale && !openLegale.has(cid)) {
              const { error } = await supabaseAdmin.from("pratiche_legali" as never).insert({
                cliente_id: cid,
                tipo: "azione_legale_generica",
                stato: "aperta",
                note: r.note_legale,
                gestita_da: userId ?? null,
              } as never);
              if (!error) {
                openLegale.add(cid);
                legale.add(cid);
              } else logs.push(`Riga ${r.excelRow}: pratica legale ${error.message}`);
            }
          }
          if (block.size) {
            await supabaseAdmin
              .from("clienti")
              .update({
                bloccato: true,
                data_blocco: now,
                motivo_blocco: "Import scadenziario: T_BLOCCO=BLOCCATO",
              } as never)
              .in("id", Array.from(block));
          }
          if (logs.length) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori")
              .eq("id", importazioneId)
              .single();
            const existing =
              (cur?.log_errori as Array<{ messaggio: string }> | null) ?? [];
            await supabaseAdmin
              .from("importazioni")
              .update({
                log_errori: [...existing, ...logs.map((m) => ({ messaggio: m }))].slice(0, 500),
              } as never)
              .eq("id", importazioneId);
          }
          totC += c;
          totU += u;
          totS += s;
          totBlocked += block.size;
          totLegale += legale.size;
          totMatched += matched.size;
          await supabaseAdmin
            .from("importazioni")
            .update({
              righe_elaborate: Math.min(i + BATCH, scadRows.length),
              righe_create: totC,
              righe_aggiornate: totU,
              righe_errore: totS,
              stato: "in_elaborazione",
            })
            .eq("id", importazioneId);
        }
        return { c: totC, u: totU, s: totS, blocked: totBlocked, legaleCreated: totLegale, matchedCount: totMatched };
      });
      scadCreated += scadAllRes.c;
      scadUpdated += scadAllRes.u;
      scadSkipped += scadAllRes.s;
      matchedClientsCount += scadAllRes.matchedCount;
      clientsToBlockCount += scadAllRes.blocked;
      clientsLegaleCount += scadAllRes.legaleCreated;

      // Blocco clienti già applicato batch-per-batch nello step


      // ASSICURAZIONI
      let assicCreated = 0,
        assicUpdated = 0,
        assicSkipped = 0;
      // assicurazione_attiva ora viene aggiornata inline nello step
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
          const clients = new Set<string>();
          for (const a of chunk) {
            const cid = clientMap.get(a.cod_cli);
            if (!cid) {
              s++;
              logs.push(`Assic riga ${a.excelRow}: cliente ${a.cod_cli} non trovato`);
              continue;
            }
            clients.add(cid);
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
          // Applica subito assicurazione_attiva per i clients del batch
          if (clients.size) {
            await supabaseAdmin
              .from("clienti")
              .update({ assicurazione_attiva: true } as never)
              .in("id", Array.from(clients));
          }
          // Persisti log inline
          if (logs.length) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori")
              .eq("id", importazioneId)
              .single();
            const existing =
              (cur?.log_errori as Array<{ messaggio: string }> | null) ?? [];
            await supabaseAdmin
              .from("importazioni")
              .update({
                log_errori: [...existing, ...logs.map((m) => ({ messaggio: m }))].slice(0, 500),
              } as never)
              .eq("id", importazioneId);
          }
          // SOLO contatori
          return { c, u, s, assicClients: clients.size };
        });
        assicCreated += res.c;
        assicUpdated += res.u;
        assicSkipped += res.s;
      }



      const summary = [
        `SCADENZIARIO: lette ${scadTot}, abbinati ${matchedClientsCount} clienti, ${scadCreated} create, ${scadUpdated} aggiornate, ${scadSkipped} saltate`,
        `ASSICURAZIONI: lette ${assicRows.length}, ${assicCreated} create, ${assicUpdated} aggiornate, ${assicSkipped} saltate`,
        `Clienti bloccati: ${clientsToBlockCount}, pratiche legali create: ${clientsLegaleCount}`,
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

function normalizeBfaCodice(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

// Mappe colonne ESATTE (case-insensitive, trim) richieste dalla spec
const COL_MAP_BLOCCO: Record<
  string,
  "cod_cli" | "ind_blocco" | "ultima_data_fatturazione" | "fido" | "assicurazione"
> = {
  cod_cli: "cod_cli",
  ind_blocco: "ind_blocco",
  "ultima data fatturazione": "ultima_data_fatturazione",
  fido: "fido",
  assicurazione: "assicurazione",
};
const COL_MAP_NOTE: Record<string, "cod_cli" | "nota"> = {
  cod_cli: "cod_cli",
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
        if (manErr || !manFile)
          throw new Error(`Download manifest fallito: ${manErr?.message ?? "no data"}`);
        const manifest = JSON.parse(await manFile.text()) as {
          kind: string;
          totaleBlocco: number;
          totaleNote: number;
          foglioNotePresente: boolean;
          chunkSize: number;
          totalChunks: number;
          chunks?: Array<{ chunkIndex: number; chunkPath: string; rowsCount?: number }>;
          warnings?: string[];
        };

        // Scarica tutti i chunk BLOCCO (sono JSON leggeri, max 500 righe ognuno)
        const rows: BFARow[] = [];
        for (let ci = 0; ci < manifest.totalChunks; ci++) {
          const manifestChunkPath = manifest.chunks?.find((c) => c.chunkIndex === ci)?.chunkPath;
          const candidatePaths = [
            manifestChunkPath,
            `${baseDir}/blocco-chunk-${ci}.json`,
            `${baseDir}/blocco_${importazioneId}_chunk_${ci}.json`,
          ].filter(Boolean) as string[];
          let chunkFile: Blob | null = null;
          let chunkPath = candidatePaths[0];
          let lastChunkError = "no data";
          for (const path of candidatePaths) {
            const { data, error } = await supabaseAdmin.storage.from("import-files").download(path);
            if (data && !error) {
              chunkFile = data;
              chunkPath = path;
              break;
            }
            lastChunkError = `${path}: ${error?.message ?? "no data"}`;
          }
          if (!chunkFile) throw new Error(`Download chunk ${ci} fallito: ${lastChunkError}`);
          logger.info(`Import D chunk ${ci + 1}/${manifest.totalChunks}: letto ${chunkPath}`);
          const chunk = JSON.parse(await chunkFile.text()) as Array<Record<string, unknown>>;
          chunk.forEach((r, idx) => {
            const codCli = normalizeBfaCodice(r.cod_cli ?? r.COD_CLI ?? r.codice_gestionale);
            if (!codCli) return;
            rows.push({
              riga: ci * manifest.chunkSize + idx + 2,
              codice_gestionale: codCli,
              ind_blocco: (r.ind_blocco ?? r.IND_BLOCCO) as number | null,
              ultima_data_fatturazione: (r.ultima_data_fatturazione ??
                r["ULTIMA DATA FATTURAZIONE"]) as string | null,
              fido: (r.fido ?? r.FIDO) as number | null,
              assicurazione: (r.assicurazione ?? r.ASSICURAZIONE) as number | null,
            });
          });
        }

        // Scarica note legali
        const noteLegali: Array<{ cod_cli: string; nota: string }> = [];
        if (manifest.foglioNotePresente && manifest.totaleNote > 0) {
          const { data: noteFile, error: noteErr } = await supabaseAdmin.storage
            .from("import-files")
            .download(`${baseDir}/note-legali.json`);
          if (noteErr || !noteFile)
            throw new Error(`Download note-legali fallito: ${noteErr?.message ?? "no data"}`);
          const noteRaw = JSON.parse(await noteFile.text()) as Array<Record<string, unknown>>;
          for (const n of noteRaw) {
            const codCli = normalizeBfaCodice(n.cod_cli ?? n.COD_CLI ?? n.codice_gestionale);
            const nota = String(n.nota ?? n["Note Legale"] ?? "").trim();
            if (codCli && nota) noteLegali.push({ cod_cli: codCli, nota });
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
      const codici = Array.from(
        new Set(parsed.map((r) => normalizeBfaCodice(r.codice_gestionale)).filter(Boolean)),
      );
      type ClienteSnap = {
        id: string;
        ragione_sociale: string | null;
        ind_blocco: number | null;
        assicurazione_attiva: boolean | null;
        in_gestione_legale: boolean | null;
      };
      // Lookup inline — senza step.run per evitare serializzazione della map grande
      const clientMap: Record<string, ClienteSnap> = {};
      {
        const BATCH = 500;
        for (let i = 0; i < codici.length; i += BATCH) {
          const slice = codici.slice(i, i + BATCH);
          const { data, error } = await supabaseAdmin
            .from("clienti")
            .select(
              "id, codice_gestionale, ragione_sociale, ind_blocco, assicurazione_attiva, in_gestione_legale",
            )
            .in("codice_gestionale", slice);
          if (error)
            throw new Error(`lookup clienti chunk ${Math.floor(i / BATCH) + 1}: ${error.message}`);
          logger.info(
            `Import D lookup clienti ${Math.floor(i / BATCH) + 1}: ${data?.length ?? 0}/${slice.length} trovati`,
          );
          (data ?? []).forEach((c) => {
            if (c.codice_gestionale) {
              clientMap[normalizeBfaCodice(c.codice_gestionale)] = {
                id: c.id,
                ragione_sociale: c.ragione_sociale ?? null,
                ind_blocco: (c as { ind_blocco?: number | null }).ind_blocco ?? null,
                assicurazione_attiva:
                  (c as { assicurazione_attiva?: boolean | null }).assicurazione_attiva ?? null,
                in_gestione_legale:
                  (c as { in_gestione_legale?: boolean | null }).in_gestione_legale ?? null,
              };
            }
          });
        }
      }

      // STEP 3: pre-fetch polizze POUEY esistenti
      const allClienteIds = Array.from(
        new Set(parsed.map((r) => clientMap[normalizeBfaCodice(r.codice_gestionale)]?.id).filter(Boolean) as string[]),
      );
      // Lookup inline — senza step.run per evitare serializzazione della map grande
      const poueyMap: Record<string, string> = {};
      {
        const BATCH = 500;
        for (let i = 0; i < allClienteIds.length; i += BATCH) {
          const slice = allClienteIds.slice(i, i + BATCH);
          if (!slice.length) continue;
          const { data } = await supabaseAdmin
            .from("assicurazioni_credito")
            .select("id, cliente_id")
            .eq("assicuratore", "POUEY")
            .in("cliente_id", slice);
          ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
            poueyMap[p.cliente_id] = p.id;
          });
        }
      }

      // STEP 4: chunk processing con anomalie
      const CHUNK = 500;
      // Leggi cutoff anno dal DB configurazioni (default 2025 se non trovato)
      const cutoffAnno = await step.run("read-cutoff-config", async () => {
        const { data } = await supabaseAdmin
          .from("configurazioni")
          .select("valore")
          .eq("chiave", "cutoff_cliente_attivo_anno")
          .maybeSingle();
        const anno = parseInt(data?.valore ?? "2025", 10);
        const annoValido = isFinite(anno) && anno >= 2020 && anno <= 2100 ? anno : 2025;
        return `${annoValido}-01-01`;
      });
      const cutoff2025 = cutoffAnno; // mantieni il nome per non rompere i riferimenti
      const nowIso = new Date().toISOString();
      const errors: Array<{ riga: number; errore: string }> = [];
      let errorsCount = 0;
      const nonTrovati: string[] = [];
      let nonTrovatiCount = 0;

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
          let cAgg = 0,
            cBlk = 0,
            cSblk = 0,
            cNonAtt = 0,
            cPol = 0,
            cAnom = 0;
          let cUpdateTentati = 0,
            cUpdateZero = 0,
            cUpdateMulti = 0;
          const cErr: Array<{ riga: number; errore: string }> = [];
          const cMiss: string[] = [];
          const anomalieBatch: AnomaliaImport[] = [];
          const updateDiagnostics: Array<{ riga: number; errore: string }> = [];

          await Promise.all(
            slice.map(async (r) => {
              try {
                const codiceGestionale = normalizeBfaCodice(r.codice_gestionale);
                const snap = clientMap[codiceGestionale];
                if (!snap) {
                  cMiss.push(codiceGestionale || r.codice_gestionale);
                  return;
                }
                const clienteId = snap.id;
                const payload: Record<string, unknown> = {};
                const rowAnomalie: AnomaliaImport[] = [];

                // --- Blocco: applicato automaticamente senza anomalia ---
                const indNuovoRaw = r.ind_blocco;
                // Forza conversione a number (il JSON potrebbe contenere string o number)
                const indNuovo = indNuovoRaw != null ? Number(indNuovoRaw) : null;
                const indAttuale = snap.ind_blocco ?? 0;
                if (indNuovo != null) {
                  if (indNuovo === 0) {
                    payload.bloccato = false;
                    payload.ind_blocco = 0;
                    payload.motivo_blocco = null;
                    payload.data_blocco = null;
                    if (indAttuale !== 0) cSblk++;
                  } else if (indNuovo === 1) {
                    payload.bloccato = true;
                    payload.ind_blocco = 1;
                    payload.motivo_blocco = "Bloccato con possibilità di sblocco";
                    payload.data_blocco = nowIso;
                    if (indAttuale !== 1) cBlk++;
                  } else if (indNuovo === 2) {
                    payload.bloccato = true;
                    payload.ind_blocco = 2;
                    payload.motivo_blocco = "Bloccato";
                    payload.data_blocco = nowIso;
                    if (indAttuale !== 2) cBlk++;
                  }
                }

                // --- Sempre aggiornati ---
                payload.ultima_data_fatturazione = r.ultima_data_fatturazione;
                const attivo =
                  r.ultima_data_fatturazione != null && r.ultima_data_fatturazione >= cutoff2025;
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
                    codice_gestionale: codiceGestionale,
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
                      if (error)
                        cErr.push({ riga: r.riga, errore: `polizza update: ${error.message}` });
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
                      if (error)
                        cErr.push({ riga: r.riga, errore: `polizza insert: ${error.message}` });
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

                // Marca ultima_importazione_d con timestampInizio + 1s (timestamp valido, strettamente > timestampInizio)
                payload.ultima_importazione_d = new Date(new Date(timestampInizio).getTime() + 1000).toISOString();

                if (Object.keys(payload).length > 0) {
                  cUpdateTentati++;
                  const { error, count } = await supabaseAdmin
                    .from("clienti")
                    .update(payload as never, { count: "exact" })
                    .eq("id", clienteId);
                  if (error) cErr.push({ riga: r.riga, errore: error.message });
                  else {
                    const affected = count ?? 0;
                    cAgg += affected;
                    if (affected === 0) {
                      cUpdateZero++;
                      cErr.push({
                        riga: r.riga,
                        errore: `UPDATE clienti COD_CLI=${codiceGestionale}: count=0`,
                      });
                    } else if (affected > 1) {
                      cUpdateMulti++;
                      updateDiagnostics.push({
                        riga: r.riga,
                        errore: `UPDATE clienti COD_CLI=${codiceGestionale}: count=${affected}`,
                      });
                    }
                  }
                }

                if (rowAnomalie.length) {
                  anomalieBatch.push(...rowAnomalie);
                  cAnom += rowAnomalie.length;
                }
              } catch (e) {
                cErr.push({
                  riga: r.riga,
                  errore: `Errore riga COD_CLI=${normalizeBfaCodice(r.codice_gestionale)}: ${e instanceof Error ? e.message : String(e)}`,
                });
              }
            }),
          );

          if (anomalieBatch.length) {
            const { error } = await supabaseAdmin
              .from("anomalie_import" as never)
              .insert(anomalieBatch as never);
            if (error) cErr.push({ riga: 0, errore: `anomalie insert: ${error.message}` });
          }

          const { error: rpcError } = await supabaseAdmin.rpc("increment_importazione_counters", {
            _id: importazioneId,
            _elaborate: slice.length,
            _create: 0,
            _update: cAgg,
            _error: cErr.length,
            _skipped: cMiss.length,
          });
          if (rpcError) cErr.push({ riga: 0, errore: `increment counters: ${rpcError.message}` });

          const chunkLog = {
            riga: 0,
            errore: `Chunk ${ci + 1}/${totalChunks}: UPDATE clienti tentati=${cUpdateTentati}, count aggiornate=${cAgg}, count=0=${cUpdateZero}, count>1=${cUpdateMulti}, non trovati=${cMiss.length}, errori=${cErr.length}`,
          };
          logger.info(chunkLog.errore);

          if (cErr.length || cMiss.length || updateDiagnostics.length || cUpdateTentati > 0) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori, codici_mancanti")
              .eq("id", importazioneId)
              .single();
            const updates: Record<string, unknown> = {};
            if (cErr.length || updateDiagnostics.length || cUpdateTentati > 0) {
              const exist =
                (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
              updates.log_errori = [...exist, chunkLog, ...updateDiagnostics, ...cErr].slice(-500);
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

          // SOLO contatori (errori/cMiss già persistiti inline)
          return {
            cAgg,
            cBlk,
            cSblk,
            cNonAtt,
            cPol,
            cAnom,
            cErr: cErr.length,
            cMiss: cMiss.length,
          };
        });
        aggiornati += chunkRes.cAgg;
        bloccati += chunkRes.cBlk;
        sbloccati += chunkRes.cSblk;
        nonAttivi += chunkRes.cNonAtt;
        polizze += chunkRes.cPol;
        anomalieTotali += chunkRes.cAnom;
        errorsCount += chunkRes.cErr;
        nonTrovatiCount += chunkRes.cMiss;
      }


      // STEP 4b: Note Legale + anomalie perde_gestione_legale
      let noteImportate = 0;
      let noteNonTrovate = 0;
      let perdeGestioneLegale = 0;

      await step.run("note-legali", async () => {
        try {
          // Lookup arricchimento clientMap per note con codici nuovi
          const missCodes = noteLegaliFromSheet.map((n) => n.cod_cli).filter((c) => !clientMap[c]);
          if (missCodes.length) {
            const uniqMiss = Array.from(new Set(missCodes));
            const BATCH = 500;
            for (let i = 0; i < uniqMiss.length; i += BATCH) {
              const slice = uniqMiss.slice(i, i + BATCH);
              const { data } = await supabaseAdmin
                .from("clienti")
                .select(
                  "id, codice_gestionale, ragione_sociale, ind_blocco, assicurazione_attiva, in_gestione_legale",
                )
                .in("codice_gestionale", slice);
              (data ?? []).forEach((c) => {
                if (c.codice_gestionale) {
                  clientMap[c.codice_gestionale] = {
                    id: c.id,
                    ragione_sociale: c.ragione_sociale ?? null,
                    ind_blocco: (c as { ind_blocco?: number | null }).ind_blocco ?? null,
                    assicurazione_attiva:
                      (c as { assicurazione_attiva?: boolean | null }).assicurazione_attiva ?? null,
                    in_gestione_legale:
                      (c as { in_gestione_legale?: boolean | null }).in_gestione_legale ?? null,
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
            if (error)
              errors.push({ riga: 0, errore: `anomalie perde_gestione: ${error.message}` });
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
          .lt("ultima_importazione_d", timestampInizio)
          .eq("in_gestione_legale", false);

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
            errore: `Riepilogo: ${aggiornati} aggiornati, ${azzerati} azzerati (assenti), ${anomalieTotali} anomalie in attesa, ${nonTrovatiCount + noteNonTrovate} non trovati, ${errorsCount + errors.length} errori`,
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
            stato: errorsCount + errors.length > 0 ? "completata_con_errori" : "completata",
            completata_at: new Date().toISOString(),
            log_errori: [...summary, ...existing].slice(0, 500),
          } as never)
          .eq("id", importazioneId);
      });

      logger.info(
        `Blocco fido done: agg=${aggiornati}, azzerati=${azzerati}, anom=${anomalieTotali}, blk=${bloccati}, sblk=${sbloccati}, nonAtt=${nonAttivi}, pol=${polizze}, noteLeg=${noteImportate}, miss=${nonTrovatiCount}, err=${errorsCount + errors.length}`,
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
        nonTrovati: nonTrovatiCount,
        errori: errorsCount + errors.length,

      };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);
