import * as XLSX from "xlsx";
import { Unzip, UnzipInflate, unzipSync, strFromU8 } from "fflate";
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ANAG_HEADERS,
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
import {
  isEmailValida,
  classificaEmail,
  splitEmailsMultiple,
  isTelefonoValido,
  classificaTelefono,
} from "@/lib/email-validazione";


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

async function downloadJsonFromStorage<T>(
  filePath: string,
  bucket: "import-files" | "import-staging" = "import-files",
): Promise<T> {
  const { data: file, error } = await supabaseAdmin.storage.from(bucket).download(filePath);
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
  rowErrors?: Array<{ riga: number; errore: string }>;
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
 * A — ANAGRAFICA (init + fan-out → N chunk → finalize, staging su Storage)
 * ============================================================================ */

const ANAG_CHUNK_SIZE = 500;
const ANAG_UPDATE_CONCURRENCY = 20;
const ANAG_MAX_LOG_ERRORI = 500;

type AnagRow = Record<string, unknown> & { __row: number };
type StagedAnagraficaChunk = {
  kind: "anagrafica-staging-v1";
  chunkIndex: number;
  totalChunks: number;
  rows: AnagRow[];
};

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, ent) => {
    const e = String(ent).toLowerCase();
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return m;
  });
}

function attrValue(xml: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr.replace(":", "(?::|&#58;)")}=["']([^"']*)["']`, "i");
  return re.exec(xml)?.[1] ?? null;
}

function anagColumnIndex(cellRef: string | null, fallback: number): number {
  const letters = cellRef?.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return fallback;
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function normAnagHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[\s._\-/]+/g, "");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml))) {
    let text = "";
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(si[1]))) text += decodeXmlText(t[1]);
    strings.push(text);
  }
  return strings;
}

function parseAnagraficaRowXml(rowXml: string, sharedStrings: string[]): { rowNumber: number; values: string[] } {
  const rowNumber = Number(attrValue(rowXml.slice(0, rowXml.indexOf(">") + 1), "r")) || 0;
  const values: string[] = [];
  // FIX: escludi '/' dagli attrs della forma aperta, altrimenti le celle self-closing
  // <c r="X" s="4"/> matchano la prima alternativa e il body non-greedy ruba il <v>
  // della cella successiva (causa delle anomalie fantasma email/pec/telefono).
  const cellRe = /<c\b([^>/]*)>([\s\S]*?)<\/c>|<c\b([^>]*?)\/>/g;
  let cell: RegExpExecArray | null;
  let fallbackCol = 0;
  while ((cell = cellRe.exec(rowXml))) {
    const attrs = cell[1] ?? cell[3] ?? "";
    const body = cell[2] ?? "";
    const col = anagColumnIndex(attrValue(attrs, "r"), fallbackCol);
    fallbackCol = col + 1;
    const type = attrValue(attrs, "t");
    let value = "";
    if (type === "inlineStr") {
      const pieces = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
      value = pieces.map((p) => decodeXmlText(p[1])).join("");
    } else {
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      value = type === "s" ? sharedStrings[Number(raw)] ?? "" : decodeXmlText(raw);
    }
    values[col] = String(value ?? "").trim();
  }
  return { rowNumber, values };
}

function resolveAnagraficaSheetPath(zip: Uint8Array): string {
  const meta = unzipSync(zip, {
    filter: (f) =>
      f.name === "xl/workbook.xml" ||
      f.name === "xl/_rels/workbook.xml.rels",
  });
  const workbookXml = meta["xl/workbook.xml"] ? strFromU8(meta["xl/workbook.xml"]) : "";
  const relsXml = meta["xl/_rels/workbook.xml.rels"]
    ? strFromU8(meta["xl/_rels/workbook.xml.rels"])
    : "";

  const sheets = Array.from(workbookXml.matchAll(/<sheet\b[^>]*>/g)).map((m, index) => {
    const tag = m[0];
    return {
      index,
      name: decodeXmlText(attrValue(tag, "name") ?? ""),
      relId: attrValue(tag, "r:id") ?? attrValue(tag, "id"),
    };
  });
  const selected =
    sheets.find((s) => s.name.toLowerCase().replace(/[\s._\-/]+/g, "") === "anagrafica") ??
    sheets[0];
  if (!selected) throw new Error("Nessun foglio trovato nel workbook");

  const rels = Array.from(relsXml.matchAll(/<Relationship\b[^>]*>/g)).map((m) => {
    const tag = m[0];
    return { id: attrValue(tag, "Id"), target: attrValue(tag, "Target") };
  });
  const target = rels.find((r) => r.id === selected.relId)?.target;
  if (!target) return `xl/worksheets/sheet${selected.index + 1}.xml`;
  const sheetPath = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("xl/")
      ? target
      : `xl/${target}`;
  return sheetPath;
}

function extractSharedStringsIncremental(zip: Uint8Array): string[] {
  const sharedStrings: string[] = [];
  let tail = "";
  let streamError: Error | null = null;
  const unzip = new Unzip((entry) => {
    if (entry.name !== "xl/sharedStrings.xml") return;
    const decoder = new TextDecoder("utf-8");
    entry.ondata = (err, data, final) => {
      if (err) {
        streamError = err;
        return;
      }
      tail += decoder.decode(data, { stream: !final });
      let last = 0;
      const siRe = /<si\b[^>]*>[\s\S]*?<\/si>/g;
      let match: RegExpExecArray | null;
      while ((match = siRe.exec(tail))) {
        sharedStrings.push(parseSharedStrings(match[0])[0] ?? "");
        last = siRe.lastIndex;
      }
      tail = tail.slice(last);
      if (final && tail.includes("<si")) {
        const leftover = /<si\b[^>]*>[\s\S]*?<\/si>/.exec(tail)?.[0];
        if (leftover) sharedStrings.push(parseSharedStrings(leftover)[0] ?? "");
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const ZIP_PUSH = 256 * 1024;
  for (let offset = 0; offset < zip.length; offset += ZIP_PUSH) {
    unzip.push(zip.subarray(offset, Math.min(offset + ZIP_PUSH, zip.length)), offset + ZIP_PUSH >= zip.length);
    if (streamError) throw streamError;
  }
  if (streamError) throw streamError;
  return sharedStrings;
}

async function stageAnagraficaWorkbookIncremental(filePath: string, stagingBase: string) {
  const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(filePath);
  if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
  const zip = new Uint8Array(await file.arrayBuffer());
  const fileBytes = zip.byteLength;
  const sheetPath = resolveAnagraficaSheetPath(zip);
  const sharedStrings = extractSharedStringsIncremental(zip);
  const chunkPaths: string[] = [];
  let totalRows = 0;
  let chunk: AnagRow[] = [];
  let headerIdx = -1;
  let headers: string[] = [];
  let streamError: Error | null = null;
  let sheetSeen = false;
  let textTail = "";
  let uploadChain = Promise.resolve();
  let queuedUploads = 0;

  const enqueueChunkUpload = (rows: AnagRow[]) => {
    const chunkIndex = chunkPaths.length;
    const path = `${stagingBase}/chunk_${chunkIndex}.json`;
    chunkPaths.push(path);
    const payload: StagedAnagraficaChunk = {
      kind: "anagrafica-staging-v1",
      chunkIndex,
      totalChunks: 0,
      rows,
    };
    queuedUploads++;
    uploadChain = uploadChain.then(async () => {
      const { error: upErr } = await supabaseAdmin.storage
        .from("import-staging")
        .upload(path, JSON.stringify(payload), { contentType: "application/json", upsert: true });
      queuedUploads--;
      if (upErr) throw new Error(`Upload chunk ${chunkIndex} fallito: ${upErr.message}`);
    });
  };

  const consumeRow = (rowXml: string) => {
    const { rowNumber, values } = parseAnagraficaRowXml(rowXml, sharedStrings);
    const excelRow = rowNumber || totalRows + 1;
    if (headerIdx < 0) {
      if (excelRow <= 10 && values.some((c) => normAnagHeader(c) === "ragionesociale")) {
        headerIdx = excelRow;
        headers = values.map((c) => String(c ?? "").trim());
      }
      return;
    }
    if (excelRow <= headerIdx) return;
    if (!values.some((c) => String(c ?? "").trim() !== "")) return;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (!h) return;
      const f = ANAG_HEADERS[normalize(h)];
      if (f) obj[f] = String(values[j] ?? "").trim();
    });
    if (!obj.ragione_sociale) return;
    totalRows++;
    chunk.push(Object.assign(obj, { __row: excelRow }));
    if (chunk.length >= ANAG_CHUNK_SIZE) {
      enqueueChunkUpload(chunk);
      chunk = [];
    }
  };

  const unzip = new Unzip((entry) => {
    if (entry.name !== sheetPath) return;
    sheetSeen = true;
    const decoder = new TextDecoder("utf-8");
    entry.ondata = (err, data, final) => {
      if (err) {
        streamError = err;
        return;
      }
      textTail += decoder.decode(data, { stream: !final });
      let last = 0;
      const rowRe = /<row\b[\s\S]*?<\/row>/g;
      let match: RegExpExecArray | null;
      while ((match = rowRe.exec(textTail))) {
        consumeRow(match[0]);
        last = rowRe.lastIndex;
      }
      textTail = textTail.slice(last);
      if (final && chunk.length) {
        enqueueChunkUpload(chunk);
        chunk = [];
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const ZIP_PUSH = 256 * 1024;
  for (let offset = 0; offset < zip.length; offset += ZIP_PUSH) {
    unzip.push(zip.subarray(offset, Math.min(offset + ZIP_PUSH, zip.length)), offset + ZIP_PUSH >= zip.length);
    if (queuedUploads > 1) await uploadChain;
    if (streamError) throw streamError;
  }
  await uploadChain;
  if (streamError) throw streamError;
  if (!sheetSeen) throw new Error(`Foglio Anagrafica non trovato nel file (${sheetPath})`);
  if (headerIdx < 0) throw new Error("Header ragione_sociale non trovato nelle prime 10 righe del foglio Anagrafica");
  return { totRows: totalRows, chunkCount: chunkPaths.length, chunks: chunkPaths, fileBytes, sheetPath };
}

async function setAnagraficaFinalState(
  importazioneId: string,
  stato: "completata" | "completata_con_errori" | "fallita",
  extraLog?: Array<{ riga: number; errore: string }>,
) {
  const { data: cur } = await supabaseAdmin
    .from("importazioni")
    .select("log_errori, righe_errore")
    .eq("id", importazioneId)
    .single();
  const existing = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
  const merged = [...(extraLog ?? []), ...existing];
  const capped = merged.slice(0, ANAG_MAX_LOG_ERRORI);
  if (merged.length > ANAG_MAX_LOG_ERRORI) {
    capped[ANAG_MAX_LOG_ERRORI - 1] = {
      riga: 0,
      errore: `... (${merged.length - ANAG_MAX_LOG_ERRORI + 1} ulteriori errori troncati per limite payload)`,
    };
  }
  await supabaseAdmin
    .from("importazioni")
    .update({
      stato,
      completata_at: new Date().toISOString(),
      log_errori: capped.length ? capped : null,
    } as never)
    .eq("id", importazioneId);
}

// === INIT: parse file, chunk su storage, fan-out ===
export const processAnagraficaImport = inngest.createFunction(
  {
    id: "process-anagrafica-import",
    name: "Process anagrafica import (init + fan-out)",
    retries: 2,
    timeouts: { finish: "30m" },
    triggers: [{ event: "import/anagrafica.requested" }],
    onFailure: async ({ error, event: failedEvent }) => {
      const importazioneId =
        (failedEvent.data as any)?.event?.data?.importazioneId ??
        (failedEvent.data as any)?.importazioneId ??
        null;
      if (!importazioneId) return;
      await setAnagraficaFinalState(importazioneId, "completata_con_errori", [
        {
          riga: 0,
          errore: `Import anagrafica (init) fallito: ${error?.message ?? "errore sconosciuto"}`,
        },
      ]);
    },
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath, userId } = event.data as EventData;
    const stagingBase = `_anagrafica_staging/${importazioneId}`;
    try {
      // STEP 1: parse file + scrittura chunk su storage (memoizzato)
      const init = await step.run("parse-and-stage", async () => {
        const staged = await stageAnagraficaWorkbookIncremental(filePath, stagingBase);
        logger.info(
          `Anagrafica init streaming: file=${(staged.fileBytes / 1024 / 1024).toFixed(2)}MB, sheet=${staged.sheetPath}, rows=${staged.totRows}, chunks=${staged.chunkCount}`,
        );
        return staged;
      });

      if (init.totRows === 0) {
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: 0,
            stato: "completata_con_errori",
            completata_at: new Date().toISOString(),
            log_errori: [{ riga: 0, errore: "Nessuna riga dati nel foglio Anagrafica" }],
          } as never)
          .eq("id", importazioneId);
        return { totRows: 0, chunkCount: 0 };
      }

      // STEP 2: init importazioni con totali + chunks
      await step.run("init-importazione", async () => {
        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: init.totRows,
            righe_elaborate: 0,
            righe_create: 0,
            righe_aggiornate: 0,
            righe_errore: 0,
            righe_saltate: 0,
            chunks_totali: init.chunkCount,
            chunks_completati: 0,
            stato: "in_elaborazione",
            log_errori: [
              {
                riga: 0,
                errore: `Init: ${init.totRows} righe totali, ${init.chunkCount} chunk da ${ANAG_CHUNK_SIZE}`,
              },
            ],
          } as never)
          .eq("id", importazioneId);
      });

      // STEP 2.5: svuotamento anomalie_import (una sola volta, prima dei chunk)
      // A regime: la tabella contiene SOLO la fotografia dell'import corrente.
      // Eseguito qui nel setup -> NON dentro il loop dei chunk.
      await step.run("reset-anomalie-import", async () => {
        const { error } = await supabaseAdmin
          .from("anomalie_import" as never)
          .delete()
          .gte("created_at", "1900-01-01");
        if (error) {
          logger.warn(`reset anomalie_import fallito: ${error.message}`);
        }
      });

      // STEP 3: fan-out di un evento per chunk

      const events = init.chunks.map((chunkPath, i) => ({
        name: "import/anagrafica.chunk" as const,
        data: {
          importazioneId,
          chunkPath,
          chunkIndex: i,
          totalChunks: init.chunkCount,
          userId,
        },
      }));
      const SEND_BATCH = 200;
      for (let i = 0; i < events.length; i += SEND_BATCH) {
        const slice = events.slice(i, i + SEND_BATCH);
        await step.run(`send-chunks-${i}`, async () => {
          await sendInngestEvents(slice);
        });
      }

      logger.info(
        `Anagrafica init done: rows=${init.totRows}, chunks=${init.chunkCount}, events emessi`,
      );
      return { totRows: init.totRows, chunkCount: init.chunkCount };
    } catch (err) {
      await setAnagraficaFinalState(importazioneId, "completata_con_errori", [
        { riga: 0, errore: `Init fallito: ${err instanceof Error ? err.message : String(err)}` },
      ]);
      throw err;
    }
  },
);

// === CHUNK: scarica e processa SOLO il proprio chunk ===
type AnagChunkEventData = {
  importazioneId: string;
  chunkPath: string;
  chunkIndex: number;
  totalChunks: number;
  userId?: string;
};

export const processAnagraficaChunk = inngest.createFunction(
  {
    id: "process-anagrafica-chunk",
    name: "Process anagrafica chunk",
    retries: 3,
    concurrency: { limit: 3 },
    triggers: [{ event: "import/anagrafica.chunk" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, chunkPath, chunkIndex, totalChunks } =
      event.data as AnagChunkEventData;

    // Concorrenza limitata
    async function runWithConcurrency<T>(
      items: T[],
      limit: number,
      worker: (item: T) => Promise<void>,
    ): Promise<void> {
      let idx = 0;
      const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
          const current = idx++;
          if (current >= items.length) return;
          await worker(items[current]);
        }
      });
      await Promise.all(runners);
    }

    // STEP A: download chunk + prep + insert/update
    const result = await step.run("process-chunk", async () => {
      const staged = await downloadJsonFromStorage<StagedAnagraficaChunk>(
        chunkPath,
        "import-staging",
      );
      const rows = staged.rows;
      logger.info(
        `Chunk anagrafica ${chunkIndex + 1}/${totalChunks}: ${rows.length} righe`,
      );

      const errs: Array<{ riga: number; errore: string }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Barriera anti-sporco email/pec: registro anomalie del chunk
      const anomalieEmail: Array<Record<string, unknown>> = [];
      let emailAzzerate = 0;
      let emailSplittate = 0;

      function applyEmailPec(
        payload: Record<string, unknown>,
        rawEmail: unknown,
        rawPec: unknown,
        meta: { __row: number; codice_gestionale: string | null; ragione_sociale: string | null },
      ) {
        const eRaw = rawEmail == null ? "" : String(rawEmail).trim();
        const pRaw = rawPec == null ? "" : String(rawPec).trim();
        const eClass = classificaEmail(eRaw);
        let pecFromSplit: string | null = null;

        if (eClass === "ok") {
          payload.email = eRaw;
        } else if (eClass === "vuota") {
          // niente da scrivere, nessuna anomalia
        } else if (eClass === "multipla") {
          // Tieni solo i pezzi VALIDI (scarta garbage tipo "info" o "mario @").
          // 1ª valida → email; 2ª valida → candidata pec (solo se pec attuale non è valida).
          const validParts = splitEmailsMultiple(eRaw).filter((p) => isEmailValida(p));
          if (validParts.length === 0) {
            // nessun pezzo valido (es. "mario @ gmail.com") → azzera
            payload.email = null;
          } else {
            payload.email = validParts[0];
            if (validParts[1]) pecFromSplit = validParts[1];
          }

          emailSplittate++;
          anomalieEmail.push({
            importazione_id: importazioneId,
            codice_gestionale: meta.codice_gestionale ?? "",
            ragione_sociale: meta.ragione_sociale,
            tipo_anomalia: "multipla",
            campo: "email",
            valore_attuale: eRaw.slice(0, 500),
            valore_nuovo: "splittato_pec",
            stato: "in_attesa",
          });
        } else {
          // non_email | malformata → azzera realmente il campo nel DB
          payload.email = null;
          emailAzzerate++;
          anomalieEmail.push({
            importazione_id: importazioneId,
            codice_gestionale: meta.codice_gestionale ?? "",
            ragione_sociale: meta.ragione_sociale,
            tipo_anomalia: eClass,
            campo: "email",
            valore_attuale: eRaw.slice(0, 500),
            valore_nuovo: "azzerato",
            stato: "in_attesa",
          });
        }

        const pClass = classificaEmail(pRaw);
        if (pClass === "ok") {
          payload.pec = pRaw;
        } else if (pClass === "vuota") {
          if (pecFromSplit) payload.pec = pecFromSplit;
        } else if (pClass === "multipla") {
          const parts = splitEmailsMultiple(pRaw);
          const first = parts.find((p) => isEmailValida(p));
          if (first) payload.pec = first;
          else if (pecFromSplit) payload.pec = pecFromSplit;
          else payload.pec = null;
          emailSplittate++;
          anomalieEmail.push({
            importazione_id: importazioneId,
            codice_gestionale: meta.codice_gestionale ?? "",
            ragione_sociale: meta.ragione_sociale,
            tipo_anomalia: "multipla",
            campo: "pec",
            valore_attuale: pRaw.slice(0, 500),
            valore_nuovo: "splittato_pec",
            stato: "in_attesa",
          });
        } else {
          // non_email | malformata → azzera (salvo il pec recuperato dallo split email)
          if (pecFromSplit) payload.pec = pecFromSplit;
          else payload.pec = null;
          emailAzzerate++;
          anomalieEmail.push({
            importazione_id: importazioneId,
            codice_gestionale: meta.codice_gestionale ?? "",
            ragione_sociale: meta.ragione_sociale,
            tipo_anomalia: pClass,
            campo: "pec",
            valore_attuale: pRaw.slice(0, 500),
            valore_nuovo: "azzerato",
            stato: "in_attesa",
          });
        }
      }


      // Barriera anti-sporco telefono/cellulare/telefono_2: stesso pattern di applyEmailPec.
      // Riusa isTelefonoValido (fonte unica in src/lib/email-validazione.ts).
      // - valido (anche "035/986692" o "345/...; 059/...") -> scrive trim
      // - vuoto/NULL -> non scrive nulla (silenzioso)
      // - non valido (testo, ID, serial-date Excel, num puro <=6 cifre, <4 cifre)
      //   -> assegna NULL DIRETTAMENTE al payload (bypass addIfPresent) + anomalia
      const anomalieTelefono: Array<Record<string, unknown>> = [];
      let telefoniAzzerati = 0;

      function applyTelefoni(
        payload: Record<string, unknown>,
        raw: { telefono: unknown; cellulare: unknown; telefono_2: unknown },
        meta: { codice_gestionale: string | null; ragione_sociale: string | null },
      ) {
        const fields: Array<["telefono" | "cellulare" | "telefono_2", unknown]> = [
          ["telefono", raw.telefono],
          ["cellulare", raw.cellulare],
          ["telefono_2", raw.telefono_2],
        ];
        for (const [campo, valore] of fields) {
          const v = valore == null ? "" : String(valore).trim();
          if (v === "") continue; // vuoto -> silenzioso
          if (isTelefonoValido(v)) {
            payload[campo] = v;
          } else {
            // azzera DIRETTAMENTE (no addIfPresent: salta i null e lascia il valore sporco)
            payload[campo] = null;
            telefoniAzzerati++;
            anomalieTelefono.push({
              importazione_id: importazioneId,
              codice_gestionale: meta.codice_gestionale ?? "",
              ragione_sociale: meta.ragione_sociale,
              tipo_anomalia: classificaTelefono(v),
              campo,
              valore_attuale: v.slice(0, 500),
              valore_nuovo: "azzerato",
              stato: "in_attesa",
            });
          }
        }
      }

      // Stores
      const { data: storesData } = await supabaseAdmin
        .from("stores")
        .select("id, codice")
        .order("codice");
      const stores: Record<string, string> = {};
      (storesData ?? []).forEach((s) => {
        if (s.codice) stores[s.codice] = s.id;
      });
      const storesByIndex = storesData ?? [];

      // Lookup existing clienti per i codici/pive di QUESTO chunk
      const codici = Array.from(
        new Set(
          rows
            .map((r) => toStr((r as Record<string, unknown>).codice_gestionale))
            .filter((v): v is string => !!v),
        ),
      );
      const pive = Array.from(
        new Set(
          rows
            .map((r) => toStr((r as Record<string, unknown>).partita_iva))
            .filter((v): v is string => !!v),
        ),
      );
      const existing: Record<string, string> = {};
      const LK_BATCH = 200;
      for (let i = 0; i < codici.length; i += LK_BATCH) {
        const slice = codici.slice(i, i + LK_BATCH);
        const { data } = await supabaseAdmin
          .from("clienti")
          .select("id, codice_gestionale")
          .in("codice_gestionale", slice);
        (data ?? []).forEach((c) => {
          if (c.codice_gestionale) existing[`cg:${c.codice_gestionale}`] = c.id;
        });
      }
      for (let i = 0; i < pive.length; i += LK_BATCH) {
        const slice = pive.slice(i, i + LK_BATCH);
        const { data } = await supabaseAdmin
          .from("clienti")
          .select("id, partita_iva")
          .in("partita_iva", slice);
        (data ?? []).forEach((c) => {
          if (c.partita_iva) existing[`pi:${c.partita_iva}`] = c.id;
        });
      }

      // Prepara payload per ogni riga
      const MACRO_LOOKUP: Record<string, string> = {
        "01": "IMPRESE EDILI",
        "02": "PRIVATI",
        "03": "DIPENDENTI",
        "04": "AZIENDA",
        "N/D": "Altre macrocategorie",
      };
      const CAT_LOOKUP: Record<string, string> = {
        "01": "IMPRESE Categoria A",
        "02": "IMPRESE Categoria B",
        "03": "IMPRESE Categoria C",
        "N/D": "Altre categorie",
      };
      const addIfPresent = (
        p: Record<string, unknown>,
        key: string,
        value: unknown,
      ) => {
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          p[key] = value;
        }
      };

      type Prepared = {
        idx: number;
        codice_gestionale: string | null;
        payload: Record<string, unknown>;
        existId: string | null;
      };
      const prepared: Prepared[] = [];
      for (const r0 of rows) {
        const r = r0 as Record<string, unknown> & { __row: number };
        try {
          let storeId: string | null = null;
          const storeCodice = toStr(r.store_codice);
          if (storeCodice) {
            storeId = stores[storeCodice] ?? null;
            if (!storeId && /^\d+$/.test(storeCodice.trim())) {
              const idx = parseInt(storeCodice.trim(), 10) - 1;
              if (idx >= 0 && idx < storesByIndex.length) storeId = storesByIndex[idx].id;
            }
            if (!storeId) {
              errs.push({
                riga: r.__row,
                errore: `Store '${storeCodice}' non trovato (warning)`,
              });
            }
          }
          const codMacro = toStr(r.codice_macrocategoria);
          const macroLabel =
            toStr(r.macrocategoria) || (codMacro && MACRO_LOOKUP[codMacro]) || null;
          const codCat = toStr(r.codice_categoria);
          const catLabel = toStr(r.categoria) || (codCat && CAT_LOOKUP[codCat]) || null;

          const payload: Record<string, unknown> = {
            ragione_sociale: toStr(r.ragione_sociale),
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
          applyTelefoni(
            payload,
            { telefono: r.telefono, cellulare: r.cellulare, telefono_2: r.telefono_2 },
            {
              codice_gestionale: toStr(r.codice_gestionale),
              ragione_sociale: toStr(r.ragione_sociale),
            },
          );
          applyEmailPec(payload, r.email, r.pec, {
            __row: r.__row,
            codice_gestionale: toStr(r.codice_gestionale),
            ragione_sociale: toStr(r.ragione_sociale),
          });
          addIfPresent(payload, "codice_sdi", toStr(r.codice_sdi));
          addIfPresent(payload, "note", toStr(r.note));
          addIfPresent(payload, "codice_macrocategoria", codMacro);
          addIfPresent(payload, "macrocategoria", macroLabel);
          addIfPresent(payload, "codice_categoria", codCat);
          addIfPresent(payload, "categoria", catLabel);
          addIfPresent(
            payload,
            "condizione_pagamento_cod",
            toStr(r.condizione_pagamento_cod),
          );
          addIfPresent(
            payload,
            "condizione_pagamento_desc",
            toStr(r.condizione_pagamento_desc),
          );
          addIfPresent(
            payload,
            "condizioni_pagamento",
            toStr(r.condizione_pagamento_desc) || toStr(r.condizioni_pagamento),
          );
          if (storeId) payload.store_id = storeId;

          if (!payload.ragione_sociale) {
            skipped++;
            errs.push({ riga: r.__row, errore: "Riga senza ragione_sociale" });
            continue;
          }

          const cg = toStr(r.codice_gestionale);
          const pi = toStr(r.partita_iva);
          const existId =
            (cg && existing[`cg:${cg}`]) || (pi && existing[`pi:${pi}`]) || null;
          prepared.push({
            idx: r.__row,
            codice_gestionale: cg,
            payload,
            existId,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          skipped++;
          errs.push({ riga: r.__row, errore: `Prep: ${msg}`.slice(0, 300) });
        }
      }

      const toInsert = prepared.filter((p) => !p.existId);
      const toUpdate = prepared.filter((p) => p.existId);

      // INSERT bulk con fallback per-riga
      if (toInsert.length) {
        const { data, error } = await supabaseAdmin
          .from("clienti")
          .insert(toInsert.map((c) => c.payload) as never)
          .select("id");
        if (error) {
          logger.warn(
            `Chunk ${chunkIndex} insert bulk fallito: ${error.message} — fallback per-riga`,
          );
          for (const c of toInsert) {
            try {
              const { error: e2 } = await supabaseAdmin
                .from("clienti")
                .insert(c.payload as never);
              if (e2) {
                errs.push({
                  riga: c.idx,
                  errore: `Insert [cod ${c.codice_gestionale ?? "?"}]: ${e2.message}`.slice(
                    0,
                    300,
                  ),
                });
                skipped++;
              } else {
                created++;
              }
            } catch (rowErr) {
              const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
              errs.push({
                riga: c.idx,
                errore: `Insert exc [cod ${c.codice_gestionale ?? "?"}]: ${msg}`.slice(0, 300),
              });
              skipped++;
            }
          }
        } else {
          created += data?.length ?? toInsert.length;
        }
      }

      // UPDATE con concorrenza
      if (toUpdate.length) {
        await runWithConcurrency(toUpdate, ANAG_UPDATE_CONCURRENCY, async (c) => {
          try {
            const { error } = await supabaseAdmin
              .from("clienti")
              .update(c.payload as never)
              .eq("id", c.existId!);
            if (error) {
              errs.push({
                riga: c.idx,
                errore: `Update [cod ${c.codice_gestionale ?? "?"}]: ${error.message}`.slice(
                  0,
                  300,
                ),
              });
              skipped++;
            } else {
              updated++;
            }
          } catch (rowErr) {
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            errs.push({
              riga: c.idx,
              errore: `Update exc [cod ${c.codice_gestionale ?? "?"}]: ${msg}`.slice(0, 300),
            });
            skipped++;
          }
        });
      }

      // Persisti errori incrementalmente con cap globale
      if (errs.length) {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori")
          .eq("id", importazioneId)
          .single();
        const existingLog =
          (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
        const merged = [...existingLog, ...errs];
        const capped = merged.slice(0, ANAG_MAX_LOG_ERRORI);
        if (merged.length > ANAG_MAX_LOG_ERRORI) {
          capped[ANAG_MAX_LOG_ERRORI - 1] = {
            riga: 0,
            errore: `... (${merged.length - ANAG_MAX_LOG_ERRORI + 1} ulteriori errori troncati per limite payload)`,
          };
        }
        await supabaseAdmin
          .from("importazioni")
          .update({ log_errori: capped } as never)
          .eq("id", importazioneId);
      }

      // Persisti anomalie email/pec del chunk + log riassuntivo
      if (anomalieEmail.length) {
        const ANOM_BATCH = 500;
        for (let i = 0; i < anomalieEmail.length; i += ANOM_BATCH) {
          const slice = anomalieEmail.slice(i, i + ANOM_BATCH);
          const { error: anomErr } = await supabaseAdmin
            .from("anomalie_import" as never)
            .insert(slice as never);
          if (anomErr) {
            errs.push({
              riga: 0,
              errore: `anomalie email insert: ${anomErr.message}`.slice(0, 300),
            });
          }
        }
        errs.push({
          riga: 0,
          errore: `Email anomalie chunk ${chunkIndex + 1}/${totalChunks}: ${anomalieEmail.length} rilevate (${emailAzzerate} azzerate, ${emailSplittate} splittate). Consulta la tabella anomalie_import.`,
        });
      }

      // Persisti anomalie telefono del chunk
      if (anomalieTelefono.length) {
        const ANOM_BATCH = 500;
        for (let i = 0; i < anomalieTelefono.length; i += ANOM_BATCH) {
          const slice = anomalieTelefono.slice(i, i + ANOM_BATCH);
          const { error: anomErr } = await supabaseAdmin
            .from("anomalie_import" as never)
            .insert(slice as never);
          if (anomErr) {
            errs.push({
              riga: 0,
              errore: `anomalie telefono insert: ${anomErr.message}`.slice(0, 300),
            });
          }
        }
        errs.push({
          riga: 0,
          errore: `Telefono anomalie chunk ${chunkIndex + 1}/${totalChunks}: ${anomalieTelefono.length} azzerate. Consulta la tabella anomalie_import.`,
        });
      }

      logger.info(
        `Chunk anagrafica ${chunkIndex + 1}/${totalChunks} done: created=${created}, updated=${updated}, skipped=${skipped}, errs=${errs.length}, anomalie_email=${anomalieEmail.length} (azzerate=${emailAzzerate}, splittate=${emailSplittate}), anomalie_telefono=${anomalieTelefono.length} (azzerate=${telefoniAzzerati})`,
      );
      return {
        elaborate: rows.length,
        created,
        updated,
        skipped,
        errori: errs.length,
      };
    });

    // STEP B: incremento atomico contatori
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

    // STEP C: cleanup file chunk
    await step.run("cleanup-chunk", async () => {
      await supabaseAdmin.storage.from("import-staging").remove([chunkPath]).catch(() => {});
      return { ok: true };
    });

    // STEP D: se è l'ultimo chunk, emetti evento finalize
    if (progress.chunks_completati >= progress.chunks_totali) {
      await step.run("send-finalize", async () => {
        await sendInngestEvents([
          { name: "import/anagrafica.finalize", data: { importazioneId } },
        ]);
      });
    }

    return {
      chunkIndex,
      ...result,
      chunks_completati: progress.chunks_completati,
      chunks_totali: progress.chunks_totali,
    };
  },
);

// === FINALIZE: somma e chiude lo stato ===
export const finalizeAnagraficaImport = inngest.createFunction(
  {
    id: "finalize-anagrafica-import",
    name: "Finalize anagrafica import",
    retries: 2,
    triggers: [{ event: "import/anagrafica.finalize" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId } = event.data as { importazioneId: string };
    try {
      const final = await step.run("read-and-finalize", async () => {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select(
            "righe_totali, righe_create, righe_aggiornate, righe_errore, righe_saltate, log_errori",
          )
          .eq("id", importazioneId)
          .single();
        const errs = (cur?.righe_errore as number | null) ?? 0;
        const skp = (cur?.righe_saltate as number | null) ?? 0;
        const stato: "completata" | "completata_con_errori" =
          errs > 0 || skp > 0 ? "completata_con_errori" : "completata";
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato,
            completata_at: new Date().toISOString(),
          } as never)
          .eq("id", importazioneId);
        return {
          stato,
          creati: (cur?.righe_create as number | null) ?? 0,
          aggiornati: (cur?.righe_aggiornate as number | null) ?? 0,
          errori: errs,
          saltati: skp,
        };
      });

      // Cleanup residui staging (best-effort)
      await step.run("cleanup-staging", async () => {
        const base = `_anagrafica_staging/${importazioneId}`;
        const { data: list } = await supabaseAdmin.storage.from("import-staging").list(base);
        if (list && list.length) {
          await supabaseAdmin.storage
            .from("import-staging")
            .remove(list.map((f) => `${base}/${f.name}`))
            .catch(() => {});
        }
        return { ok: true };
      });

      logger.info(
        `Anagrafica finalize ${importazioneId}: stato=${final.stato}, creati=${final.creati}, aggiornati=${final.aggiornati}, errori=${final.errori}, saltati=${final.saltati}`,
      );
      return final;
    } catch (err) {
      await setAnagraficaFinalState(importazioneId, "completata_con_errori", [
        {
          riga: 0,
          errore: `Finalize fallito: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
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
    timeouts: { finish: "15m" },
    triggers: [{ event: "import/analisi_rischio.requested" }],
    onFailure: async ({ error, event: failedEvent }) => {
      const importazioneId =
        (failedEvent.data as any)?.importazioneId ?? null;
      if (!importazioneId) return;
      await supabaseAdmin
        .from("importazioni")
        .update({
          stato: "completata_con_errori",
          completata_at: new Date().toISOString(),
          log_errori: [{
            riga: 0,
            errore: `Import fallito dopo tutti i retry: ${error?.message ?? "errore sconosciuto"}`,
          }],
        } as never)
        .eq("id", importazioneId)
        .eq("stato", "in_elaborazione");
    },
  },
  async ({ event, step }) => {
    const { importazioneId, filePath } = event.data as EventData;
    const stagingBase = `_rischio_staging/${importazioneId}`;
    try {
      // STEP 1 — parse + staging su Storage (memoizzato)
      const initResult = await step.run("parse-and-stage", async () => {
        const wb = await downloadWorkbook(filePath);
        const { rows, missing } = parseRischioSheet(wb.Sheets[wb.SheetNames[0]]);

        const rowsJson = JSON.stringify(rows);
        await supabaseAdmin.storage
          .from("import-staging")
          .upload(`${stagingBase}/rows.json`, rowsJson, {
            contentType: "application/json",
            upsert: true,
          });

        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: rows.length + missing.length,
            righe_errore: missing.length,
            stato: "in_elaborazione",
            log_errori: missing.length
              ? missing.slice(0, 500).map((idx: number) => ({
                  riga: idx,
                  errore: "Codice gestionale mancante",
                }))
              : null,
          } as never)
          .eq("id", importazioneId);

        return {
          total: rows.length,
          missingCount: missing.length,
          rowsPath: `${stagingBase}/rows.json`,
        };
      });

      // STEP 2 — lookup clienti + staging su Storage (memoizzato)
      const lookupResult = await step.run("build-lookup", async () => {
        const { data: rowsData } = await supabaseAdmin.storage
          .from("import-staging")
          .download(`${stagingBase}/rows.json`);
        const rows = JSON.parse(await rowsData!.text()) as Array<{
          idx: number;
          codice_gestionale: string;
          ragione_sociale: string;
          payload: Record<string, unknown>;
        }>;

        const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
        const lookup: Record<string, string> = {};
        const CHUNK = 200;
        for (let i = 0; i < codici.length; i += CHUNK) {
          const slice = codici.slice(i, i + CHUNK);
          const { data } = await supabaseAdmin
            .from("clienti")
            .select("id, codice_gestionale")
            .in("codice_gestionale", slice)
            .limit(CHUNK + 10);
          (data ?? []).forEach((c: { id: string; codice_gestionale: string | null }) => {
            if (c.codice_gestionale) lookup[c.codice_gestionale] = c.id;
          });
        }

        await supabaseAdmin.storage
          .from("import-staging")
          .upload(`${stagingBase}/lookup.json`, JSON.stringify(lookup), {
            contentType: "application/json",
            upsert: true,
          });

        return { lookupPath: `${stagingBase}/lookup.json`, found: Object.keys(lookup).length };
      });

      // STEP 3 — processa tutti i batch (memoizzato, un solo step)
      const allRes = await step.run("process-all-batches", async () => {
        const [rowsBlob, lookupBlob] = await Promise.all([
          supabaseAdmin.storage.from("import-staging").download(`${stagingBase}/rows.json`),
          supabaseAdmin.storage.from("import-staging").download(`${stagingBase}/lookup.json`),
        ]);
        const rows = JSON.parse(await rowsBlob.data!.text()) as Array<{
          idx: number;
          codice_gestionale: string;
          ragione_sociale: string;
          payload: Record<string, unknown>;
        }>;
        const lookup: Record<string, string> = JSON.parse(await lookupBlob.data!.text());

        const now = new Date().toISOString();
        let aggiornati = 0;
        let saltati = 0;
        let errori = 0;
        const BATCH = 500;

        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const errs: Array<{ riga: number; errore: string }> = [];
          await Promise.all(
            chunk.map(async (r) => {
              const id = lookup[r.codice_gestionale];
              if (!id) {
                saltati++;
                errs.push({
                  riga: r.idx,
                  errore: `Codice ${r.codice_gestionale} non trovato`,
                });
                return;
              }
              const { error } = await supabaseAdmin
                .from("clienti")
                .update({ ...r.payload, ultima_sincronizzazione: now } as never)
                .eq("id", id);
              if (error) {
                errori++;
                errs.push({ riga: r.idx, errore: `Update: ${error.message}` });
              } else {
                aggiornati++;
              }
            }),
          );

          if (errs.length) {
            const { data: cur } = await supabaseAdmin
              .from("importazioni")
              .select("log_errori")
              .eq("id", importazioneId)
              .single();
            const existing = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
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
            } as never)
            .eq("id", importazioneId);
        }

        return { aggiornati, saltati, errori };
      });

      // STEP 4 — finalizza
      const totaleElaborate = initResult.total + initResult.missingCount;
      const cErrori = initResult.missingCount + allRes.errori + allRes.saltati;
      const statoFinale = cErrori > 0 ? "completata_con_errori" : "completata";
      const logFinale = [{
        riga: 0,
        errore: `Riepilogo: ${allRes.aggiornati} aggiornati, ${allRes.saltati} saltati, ${cErrori} errori totali`,
      }];

      await step.run("finalize", async () => {
        await supabaseAdmin.storage.from("import-staging").remove([
          `${stagingBase}/rows.json`,
          `${stagingBase}/lookup.json`,
        ]);

        await supabaseAdmin
          .from("importazioni")
          .update({
            righe_elaborate: totaleElaborate,
            righe_create: 0,
            righe_aggiornate: allRes.aggiornati,
            righe_errore: cErrori,
            stato: statoFinale,
            completata_at: new Date().toISOString(),
            log_errori: logFinale,
          } as never)
          .eq("id", importazioneId);
        return { ok: true };
      });

      return { ok: true, aggiornati: allRes.aggiornati, saltati: allRes.saltati, errori: cErrori };
    } catch (err) {
      await supabaseAdmin.storage.from("import-staging").remove([
        `${stagingBase}/rows.json`,
        `${stagingBase}/lookup.json`,
      ]).catch(() => {});
      await setImportazioneError(
        importazioneId,
        err instanceof Error ? err.message : String(err),
      );
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
        return {
          rows: staged.rows,
          missing: staged.missing,
          codici,
          parseRowErrors: staged.rowErrors ?? [],
        };
      }
      const wb = await downloadWorkbookLean(filePath, "SCADENZIARIO");
      const sheet = findSheetByName(wb, "SCADENZIARIO");
      if (!sheet) throw new Error("Foglio SCADENZIARIO non trovato");
      const { rows, missing, rowErrors } = parseScadenziarioRangeLean(
        sheet,
        headers,
        startRow0,
        endRow0,
      );
      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      return { rows, missing, codici, parseRowErrors: rowErrors };
    });

    const { rows, missing, codici, parseRowErrors } = parsed;
    logger.info(
      `Chunk ${chunkIndex + 1}/${totalChunks}: rows=${rows.length}, missing=${missing.length}, codici=${codici.length}, parseErr=${parseRowErrors.length}`,
    );

    // STEP B: lookup clienti per codici di questo chunk
    // Lookup inline — senza step.run per evitare serializzazione della map grande
    const clientMap: Record<string, string> = {};
    {
      const BATCH = 500;
      for (let i = 0; i < codici.length; i += BATCH) {
        const slice = codici.slice(i, i + BATCH);
        if (!slice.length) continue;
        try {
          const { data: cdata } = await supabaseAdmin
            .from("clienti")
            .select("id, codice_gestionale")
            .in("codice_gestionale", slice as string[]);
          (cdata ?? []).forEach((c) => {
            if (c.codice_gestionale) clientMap[c.codice_gestionale] = c.id;
          });
        } catch (err) {
          logger.warn(
            `Lookup clienti fallito (chunk ${chunkIndex}, batch ${i}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // STEP C: prepara, deduplica, upsert + persisti errori/codici inline
    const result = await step.run("upsert-batch", async () => {
      const rowErrs: Array<{ riga: number; errore: string }> = [
        ...parseRowErrors,
        ...missing.map((idx) => ({ riga: idx, errore: "COD_CLI mancante" })),
      ];
      const batchErrs: Array<{ riga: number; errore: string }> = [];
      const matched: string[] = [];
      const rawValidRows: Array<Record<string, unknown>> = [];
      let skipped = 0;
      // Dettagli completi dei codici non trovati (senza cap): codice -> { ragione_sociale, count }
      const skippedDetails: Record<string, { ragione_sociale: string; count: number }> = {};
      for (const r of rows) {
        try {
          const cid = clientMap[r.codice_gestionale];
          if (!cid) {
            skipped++;
            const cg = String(r.codice_gestionale ?? "").trim();
            if (cg) {
              const cur = skippedDetails[cg];
              if (cur) {
                cur.count++;
                if (!cur.ragione_sociale && r.ragione_sociale) cur.ragione_sociale = r.ragione_sociale;
              } else {
                skippedDetails[cg] = {
                  ragione_sociale: r.ragione_sociale ?? "",
                  count: 1,
                };
              }
            }
            continue;
          }
          const enriched = {
            ...r.payload,
            cliente_id: cid,
            importato_da: importazioneId,
            ultima_sincronizzazione: timestampInizio,
          };
          matched.push(cid);
          rawValidRows.push(enriched);
        } catch (err) {
          // Skip isolato per la singola riga: l'errore NON ferma il batch
          rowErrs.push({
            riga: r.idx,
            errore: `Row build: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
          });
        }
      }

      // Dedup per chiave conflict NUOVA: (cliente, key_documento, data_scadenza, key_tipo_effetto, importo_scadenza)
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of rawValidRows) {
        try {
          const cid = row.cliente_id as string;
          if (!cid) continue;
          const kd = (row.key_documento as string | null | undefined) ?? "NULL";
          const ds = (row.data_scadenza as string | null | undefined) ?? "NULL";
          const kt =
            (row.key_tipo_effetto as number | null | undefined) != null
              ? String(row.key_tipo_effetto)
              : "NULL";
          const imp =
            (row.importo_scadenza as number | null | undefined) != null
              ? String(row.importo_scadenza)
              : "NULL";
          deduped.set(`${cid}|${kd}|${ds}|${kt}|${imp}`, row);
        } catch (err) {
          rowErrs.push({
            riga: 0,
            errore: `Dedup key: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
          });
        }
      }
      const validRows = Array.from(deduped.values());
      const validKeys = new Set(deduped.keys());

      // Pre-fetch chiavi esistenti per distinguere create vs update
      const cids = Array.from(new Set(matched));
      const existingKeys = new Set<string>();
      if (cids.length) {
        const { data: edata } = await supabaseAdmin
          .from("scadenze" as never)
          .select("cliente_id, key_documento, data_scadenza, key_tipo_effetto, importo_scadenza")
          .in("cliente_id", cids);
        (
          (edata ?? []) as Array<{
            cliente_id: string;
            key_documento: string | null;
            data_scadenza: string | null;
            key_tipo_effetto: number | null;
            importo_scadenza: number | null;
          }>
        ).forEach((s) => {
          existingKeys.add(
            `${s.cliente_id}|${s.key_documento ?? "NULL"}|${s.data_scadenza ?? "NULL"}|${s.key_tipo_effetto != null ? String(s.key_tipo_effetto) : "NULL"}|${s.importo_scadenza != null ? String(s.importo_scadenza) : "NULL"}`,
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
          onConflict: "cliente_id,key_documento,data_scadenza,key_tipo_effetto,importo_scadenza",
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


      // Persisti errori/codici mancanti + report_saltati ricco (no cap)
      const totalErrs = rowErrs.length + batchErrs.length;
      const skippedCodesArr = Object.keys(skippedDetails);
      if (rowErrs.length || batchErrs.length || skippedCodesArr.length) {
        const { data: cur } = await supabaseAdmin
          .from("importazioni")
          .select("log_errori, codici_mancanti, report_saltati")
          .eq("id", importazioneId)
          .single();
        const updates: Record<string, unknown> = {};
        if (rowErrs.length || batchErrs.length) {
          const existing =
            (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
          // Cap a 500 per non gonfiare a dismisura il jsonb log_errori
          updates.log_errori = [...existing, ...batchErrs, ...rowErrs].slice(0, 500);
        }
        if (skippedCodesArr.length) {
          // codici_mancanti: lista distinta SENZA cap (retrocompat con UI vecchia)
          const existingCodes = (cur?.codici_mancanti as string[] | null) ?? [];
          updates.codici_mancanti = Array.from(
            new Set([...existingCodes, ...skippedCodesArr]),
          );

          // report_saltati: dettaglio completo con ragione sociale e count
          type ReportSaltati = {
            cliente_non_trovato?: Record<string, { ragione_sociale: string; count: number }>;
            errori_riga?: Array<{ riga: number; errore: string }>;
          };
          const existingReport = (cur?.report_saltati as ReportSaltati | null) ?? {};
          const existingCnt = existingReport.cliente_non_trovato ?? {};
          for (const [cg, det] of Object.entries(skippedDetails)) {
            const prev = existingCnt[cg];
            if (prev) {
              prev.count += det.count;
              if (!prev.ragione_sociale && det.ragione_sociale)
                prev.ragione_sociale = det.ragione_sociale;
            } else {
              existingCnt[cg] = { ...det };
            }
          }
          const existingErr = existingReport.errori_riga ?? [];
          const newErr = [...rowErrs, ...batchErrs];
          updates.report_saltati = {
            cliente_non_trovato: existingCnt,
            errori_riga: [...existingErr, ...newErr].slice(0, 2000),
          };
        } else if (rowErrs.length || batchErrs.length) {
          type ReportSaltati = {
            cliente_non_trovato?: Record<string, { ragione_sociale: string; count: number }>;
            errori_riga?: Array<{ riga: number; errore: string }>;
          };
          const existingReport = (cur?.report_saltati as ReportSaltati | null) ?? {};
          const existingErr = existingReport.errori_riga ?? [];
          updates.report_saltati = {
            cliente_non_trovato: existingReport.cliente_non_trovato ?? {},
            errori_riga: [...existingErr, ...rowErrs, ...batchErrs].slice(0, 2000),
          };
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
        elaborate: rows.length + missing.length + parseRowErrors.length,
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
      // Le righe pagate vengono ora MANTENUTE: hanno data_pagamento_effettiva
      // valorizzata e vengono filtrate downstream (queries scaduto/recupero).
      // Nessuna reconciliation: il file potrebbe non contenere tutte le scadenze
      // ancora valide (es. a scadere) e non vogliamo chiuderle erroneamente.
      const reconc = { totChiuse: 0, totClienti: 0, orfaniRimossi: 0 };
      void timestampInizio;

      // STEP anti-orfani: per ogni tripla naturale presente nell'import corrente,
      // rimuove le righe scadenze in DB con stessa tripla ma importo NON aggiornato
      // dall'import corrente (rettifica importo lato gestionale → riga vecchia orfana).
      // Agisce SOLO su triple effettivamente presenti nel file (protegge da export
      // parziali) e preserva i frazionamenti legittimi (entrambe le righe nel file
      // vengono upsertate ed entrambe restano). Eseguito UNA volta dopo l'upsert
      // di tutti i chunk. Le righe orfane sono loggate in anomalie_import per audit.
      reconc.orfaniRimossi = await step.run("rimuovi-orfani-scadenze", async () => {
        const { data, error } = await (
          supabaseAdmin.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: number | null; error: { message: string } | null }>
        )("rimuovi_orfani_scadenze", { _importazione_id: importazioneId });
        if (error) throw new Error(`rimuovi_orfani_scadenze: ${error.message}`);
        return (data as number | null) ?? 0;
      });
      logger.info(`Finalize ${importazioneId}: orfani rimossi=${reconc.orfaniRimossi}`);





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
            errore: `Reconciliation: chiuse ${reconc.totChiuse} scadenze su ${reconc.totClienti} clienti; orfani rimossi (rettifiche): ${reconc.orfaniRimossi}`,
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
        `Finalize ${importazioneId}: chiuse=${reconc.totChiuse}, clienti=${reconc.totClienti}, orfani=${reconc.orfaniRimossi}`,
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
    timeouts: { finish: "15m" },
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

      // UN SOLO step.run per tutti i batch assicurazioni
      const assicAllRes = await step.run("process-all-assic-batches", async () => {
        const BATCH = 500;
        let totC = 0,
          totU = 0,
          totS = 0;
        for (let i = 0; i < assicRows.length; i += BATCH) {
          const chunk = assicRows.slice(i, i + BATCH);
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
          if (clients.size) {
            await supabaseAdmin
              .from("clienti")
              .update({ assicurazione_attiva: true } as never)
              .in("id", Array.from(clients));
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
        }
        return { c: totC, u: totU, s: totS };
      });
      assicCreated += assicAllRes.c;
      assicUpdated += assicAllRes.u;
      assicSkipped += assicAllRes.s;



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
    timeouts: { finish: "15m" },
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

      // STEP 2: init-importazione — REPLAY-SAFE
      // - genera timestampInizio UNA SOLA VOLTA (cached da Inngest tra i replay)
      // - resetta i contatori UNA SOLA VOLTA (non più riazzerati a ogni replay)
      const init = await step.run("init-importazione", async () => {
        const ts = new Date().toISOString();
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
            log_errori: (initialWarnings.length ? initialWarnings : []) as never,
          } as never)
          .eq("id", importazioneId);
        return { timestampInizio: ts };
      });
      const timestampInizio = init.timestampInizio;

      if (!parsed.length) {
        await step.run("finalize-empty", async () => {
          await supabaseAdmin
            .from("importazioni")
            .update({
              stato: "completata_con_errori",
              completata_at: new Date().toISOString(),
              log_errori: [{ riga: 0, errore: "Nessuna riga da processare" }] as never,
            } as never)
            .eq("id", importazioneId);
        });
        return { rows: 0 };
      }

      type ClienteSnap = {
        id: string;
        ragione_sociale: string | null;
        ind_blocco: number | null;
        assicurazione_attiva: boolean | null;
        in_gestione_legale: boolean | null;
      };

      // STEP 3: cutoff config — subito dopo init, PRIMA di qualunque lookup pesante
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
      const cutoff2025 = cutoffAnno;
      const ultimaImpIso = new Date(new Date(timestampInizio).getTime() + 1000).toISOString();

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

      const CHUNK = 500;
      const totalChunks = Math.ceil(parsed.length / CHUNK);

      // STEP 4: un step.run STABILE per ogni chunk — id deterministico padded.
      // Ogni chunk è autocontenuto: lookup clienti mirato, lookup polizze mirato,
      // bulk_update_clienti_bfa, polizze, anomalie, log, aggiornamento contatori.
      // Niente lookup globali fuori dagli step → niente lavoro pesante che si rifa a ogni replay.
      for (let ci = 0; ci < totalChunks; ci++) {
        const nowIso = new Date().toISOString();
        const stepId = `process-bfa-chunk-${String(ci).padStart(3, "0")}`;
        const res = await step.run(stepId, async () => {
          const slice = parsed.slice(ci * CHUNK, (ci + 1) * CHUNK);

          // --- Lookup clienti SOLO per i codici di questo chunk
          const codiciChunk = Array.from(
            new Set(slice.map((r) => normalizeBfaCodice(r.codice_gestionale)).filter(Boolean)),
          );
          const clientMap: Record<string, ClienteSnap> = {};
          if (codiciChunk.length) {
            const { data, error } = await supabaseAdmin
              .from("clienti")
              .select(
                "id, codice_gestionale, ragione_sociale, ind_blocco, assicurazione_attiva, in_gestione_legale",
              )
              .in("codice_gestionale", codiciChunk);
            if (error) throw new Error(`lookup clienti chunk ${ci + 1}: ${error.message}`);
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

          // --- Lookup polizze POUEY SOLO per i cliente_id di questo chunk
          const clienteIdsChunk = Array.from(
            new Set(Object.values(clientMap).map((s) => s.id).filter(Boolean) as string[]),
          );
          const poueyMap: Record<string, string> = {};
          if (clienteIdsChunk.length) {
            const { data } = await supabaseAdmin
              .from("assicurazioni_credito")
              .select("id, cliente_id")
              .eq("assicuratore", "POUEY")
              .in("cliente_id", clienteIdsChunk);
            ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
              poueyMap[p.cliente_id] = p.id;
            });
          }

          let cBlk = 0,
            cSblk = 0,
            cNonAtt = 0,
            cPol = 0;
          const cErr: Array<{ riga: number; errore: string }> = [];
          const cMiss: string[] = [];
          const anomalieBatch: AnomaliaImport[] = [];
          const payloads: Array<Record<string, unknown>> = [];
          const polizzeUpdate: Array<{ id: string; importo: number }> = [];
          const polizzeInsert: Array<{ cliente_id: string; importo: number; riga: number }> = [];

          for (const r of slice) {
            try {
              const codiceGestionale = normalizeBfaCodice(r.codice_gestionale);
              const snap = clientMap[codiceGestionale];
              if (!snap) {
                cMiss.push(codiceGestionale || r.codice_gestionale);
                continue;
              }
              const clienteId = snap.id;
              const payload: Record<string, unknown> = { id: clienteId };

              const indNuovoRaw = r.ind_blocco;
              const indNuovo = indNuovoRaw != null ? Number(indNuovoRaw) : null;
              const indAttuale = snap.ind_blocco ?? 0;
              if (indNuovo != null && !Number.isNaN(indNuovo)) {
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

              payload.ultima_data_fatturazione = r.ultima_data_fatturazione;
              const attivo =
                r.ultima_data_fatturazione != null && r.ultima_data_fatturazione >= cutoff2025;
              payload.cliente_attivo = attivo;
              if (!attivo) cNonAtt++;

              if (r.fido !== null && r.fido !== undefined) {
                payload.fido_gestionale = r.fido ?? 0;
              }

              const nuovaAssic =
                r.assicurazione !== null && r.assicurazione !== undefined && r.assicurazione > 0;
              let assicAnomalo = false;
              if (snap.assicurazione_attiva === true && !nuovaAssic) {
                anomalieBatch.push({
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
                    polizzeUpdate.push({ id: existingId, importo: r.assicurazione as number });
                  } else {
                    polizzeInsert.push({
                      cliente_id: clienteId,
                      importo: r.assicurazione as number,
                      riga: r.riga,
                    });
                  }
                } else {
                  payload.assicurazione_attiva = false;
                }
              }

              payload.ultima_importazione_d = ultimaImpIso;
              payloads.push(payload);
            } catch (e) {
              cErr.push({
                riga: r.riga,
                errore: `Errore riga COD_CLI=${normalizeBfaCodice(r.codice_gestionale)}: ${e instanceof Error ? e.message : String(e)}`,
              });
            }
          }

          // --- BULK UPDATE via RPC: aggiorna SOLO campi blocco/fido/assic, mai ragione_sociale
          let cAgg = 0;
          if (payloads.length) {
            const { data, error } = await supabaseAdmin.rpc(
              "bulk_update_clienti_bfa" as never,
              { _payloads: payloads as never } as never,
            );
            if (error) {
              cErr.push({ riga: 0, errore: `bulk_update clienti chunk ${ci + 1}: ${error.message}` });
            } else {
              cAgg = typeof data === "number" ? data : Number(data) || 0;
            }
          }

          if (polizzeUpdate.length) {
            for (const p of polizzeUpdate) {
              const { error } = await supabaseAdmin
                .from("assicurazioni_credito")
                .update({ importo_massimale: p.importo, stato: "attiva" } as never)
                .eq("id", p.id);
              if (error) cErr.push({ riga: 0, errore: `polizza update: ${error.message}` });
              else cPol++;
            }
          }
          if (polizzeInsert.length) {
            const { data, error } = await supabaseAdmin
              .from("assicurazioni_credito")
              .insert(
                polizzeInsert.map((p) => ({
                  cliente_id: p.cliente_id,
                  assicuratore: "POUEY",
                  importo_massimale: p.importo,
                  stato: "attiva",
                })) as never,
              )
              .select("id, cliente_id");
            if (error) {
              cErr.push({ riga: 0, errore: `polizze insert chunk ${ci + 1}: ${error.message}` });
            } else {
              cPol += ((data ?? []) as Array<unknown>).length;
            }
          }

          if (anomalieBatch.length) {
            const { error } = await supabaseAdmin
              .from("anomalie_import" as never)
              .insert(anomalieBatch as never);
            if (error) cErr.push({ riga: 0, errore: `anomalie insert: ${error.message}` });
          }

          const chunkLog = {
            riga: 0,
            errore: `Chunk ${ci + 1}/${totalChunks}: payloads=${payloads.length}, aggiornati=${cAgg}, polizze=${cPol}, anomalie=${anomalieBatch.length}, non_trovati=${cMiss.length}, errori=${cErr.length}`,
          };
          logger.info(chunkLog.errore);

          // --- Aggiornamento contatori importazione: read-modify-write atomico per chunk
          const { data: cur } = await supabaseAdmin
            .from("importazioni")
            .select("righe_elaborate, righe_aggiornate, righe_errore, righe_saltate, log_errori, codici_mancanti")
            .eq("id", importazioneId)
            .single();
          const baseElab = (cur?.righe_elaborate as number | null) ?? 0;
          const baseAgg = (cur?.righe_aggiornate as number | null) ?? 0;
          const baseErr = (cur?.righe_errore as number | null) ?? 0;
          const baseMiss = (cur?.righe_saltate as number | null) ?? 0;
          const existingLog =
            (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
          const existingMiss = (cur?.codici_mancanti as string[] | null) ?? [];

          await supabaseAdmin
            .from("importazioni")
            .update({
              righe_elaborate: baseElab + slice.length,
              righe_aggiornate: baseAgg + cAgg,
              righe_errore: baseErr + cErr.length,
              righe_saltate: baseMiss + cMiss.length,
              log_errori: [...existingLog, chunkLog, ...cErr].slice(-500),
              codici_mancanti: cMiss.length
                ? Array.from(new Set([...existingMiss, ...cMiss])).slice(0, 500)
                : existingMiss,
            } as never)
            .eq("id", importazioneId);

          return {
            cAgg,
            cBlk,
            cSblk,
            cNonAtt,
            cPol,
            cAnom: anomalieBatch.length,
            cErr: cErr.length,
            cMissCount: cMiss.length,
            cMissCodes: cMiss.slice(0, 200),
          };
        });

        aggiornati += res.cAgg;
        bloccati += res.cBlk;
        sbloccati += res.cSblk;
        nonAttivi += res.cNonAtt;
        polizze += res.cPol;
        anomalieTotali += res.cAnom;
        errorsCount += res.cErr;
        nonTrovatiCount += res.cMissCount;
        nonTrovati.push(...res.cMissCodes);
      }

      // --- clientMap globale per gli step note-legali / azzera-assenti (ricostruito su richiesta)
      const codici = Array.from(
        new Set(parsed.map((r) => normalizeBfaCodice(r.codice_gestionale)).filter(Boolean)),
      );
      const clientMap: Record<string, ClienteSnap> = {};

      // STEP 4c: QUADRATURA — verifica oggettiva contro il DB
      const quadratura = await step.run("verifica-quadratura", async () => {
        const atteso = parsed.length - nonTrovatiCount;
        // Conta i clienti effettivamente toccati da questo import
        const { count: aggiornatiDb } = await supabaseAdmin
          .from("clienti")
          .select("id", { count: "exact", head: true })
          .gte("ultima_importazione_d", timestampInizio);
        const real = aggiornatiDb ?? 0;
        const gap = atteso - real;
        logger.info(
          `QUADRATURA: parsed=${parsed.length}, non_trovati=${nonTrovatiCount}, attesi=${atteso}, aggiornati_db=${real}, gap=${gap}`,
        );
        return { parsed: parsed.length, non_trovati: nonTrovatiCount, atteso, aggiornati_db: real, gap };
      });


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
          // ma NON presenti nel foglio Note Legale.
          // Query mirata: in_gestione_legale=true AND codice_gestionale IN (codici), batch.
          const anomaliePerdita: AnomaliaImport[] = [];
          const BATCH_PG = 500;
          for (let i = 0; i < codici.length; i += BATCH_PG) {
            const sliceCod = codici.slice(i, i + BATCH_PG);
            const { data: rowsPG } = await supabaseAdmin
              .from("clienti")
              .select("id, codice_gestionale, ragione_sociale")
              .eq("in_gestione_legale", true)
              .in("codice_gestionale", sliceCod);
            for (const c of (rowsPG ?? []) as Array<{
              id: string;
              codice_gestionale: string | null;
              ragione_sociale: string | null;
            }>) {
              if (!clientiInGestioneNuovi.has(c.id)) {
                anomaliePerdita.push({
                  importazione_id: importazioneId,
                  cliente_id: c.id,
                  codice_gestionale: c.codice_gestionale ?? "",
                  ragione_sociale: c.ragione_sociale,
                  tipo_anomalia: "perde_gestione_legale",
                  campo: "in_gestione_legale",
                  valore_attuale: "true",
                  valore_nuovo: "false",
                  stato: "in_attesa",
                });
              }
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
      // SOLO se la quadratura è OK: se gap>0, l'azzeramento aggraverebbe il problema
      // marcando come "assenti" clienti che invece sono stati persi nei chunk.
      let azzerati = 0;
      const quadraturaOk = quadratura.gap === 0;
      await step.run("azzera-assenti", async () => {
        if (!quadraturaOk) {
          logger.warn(
            `azzera-assenti SALTATO: quadratura gap=${quadratura.gap} (attesi=${quadratura.atteso}, aggiornati_db=${quadratura.aggiornati_db}). Evito di azzerare clienti potenzialmente persi nei chunk.`,
          );
          errors.push({
            riga: 0,
            errore: `azzera-assenti SALTATO per gap di quadratura (gap=${quadratura.gap}). Rilanciare l'import.`,
          });
          return;
        }
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



      // STEP 6: stato finale + log riepilogo + QUADRATURA visibile
      await step.run("finalize", async () => {
        const quadOk = quadratura.gap === 0;
        const quadLine = quadOk
          ? `✓ QUADRATURA OK: attesi=${quadratura.atteso}, aggiornati nel DB=${quadratura.aggiornati_db}, gap=0`
          : `✗ QUADRATURA KO: attesi=${quadratura.atteso}, aggiornati nel DB=${quadratura.aggiornati_db}, GAP=${quadratura.gap} righe perse`;
        const summary = [
          { riga: 0, errore: quadLine },
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
          .select("log_errori, report_saltati")
          .eq("id", importazioneId)
          .single();
        const existing = (cur?.log_errori as Array<{ riga: number; errore: string }> | null) ?? [];
        const existingReport = (cur?.report_saltati as Record<string, unknown> | null) ?? {};
        const statoFinale =
          !quadOk || errorsCount + errors.length > 0 ? "completata_con_errori" : "completata";
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato: statoFinale,
            completata_at: new Date().toISOString(),
            log_errori: [...summary, ...existing].slice(0, 500),
            report_saltati: { ...existingReport, quadratura } as never,
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
