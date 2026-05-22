import * as XLSX from "xlsx";
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  anagraficaSheetToObjects, parseRischioSheet, parseScadenziarioOfficialSheet,
  parseScadenziarioBlockSheet, parseAssicurazioneSheet, toStr, normalize, findSheetByName,
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
  await supabaseAdmin.from("importazioni").update({
    stato: "completata_con_errori",
    completata_at: new Date().toISOString(),
    log_errori: [{ riga: 0, errore: `Errore fatale: ${message}` }],
  }).eq("id", importazioneId);
}

/* ============================================================================
 * A — ANAGRAFICA
 * ============================================================================ */

export const processAnagraficaImport = inngest.createFunction(
  { id: "process-anagrafica-import", name: "Process anagrafica import", retries: 2,
    triggers: [{ event: "import/anagrafica.requested" }] },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    const errorLog: Array<{ riga: number; errore: string }> = [];
    let created = 0, updated = 0, skipped = 0;

    const update = async (stato: "in_elaborazione" | "completata" | "completata_con_errori", done = false) => {
      await supabaseAdmin.from("importazioni").update({
        righe_elaborate: created + updated + errorLog.length,
        righe_create: created, righe_aggiornate: updated, righe_errore: skipped + errorLog.length,
        stato, completata_at: done ? new Date().toISOString() : null,
        log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
      }).eq("id", importazioneId);
    };

    try {
      const rows = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        return anagraficaSheetToObjects(wb.Sheets[wb.SheetNames[0]]);
      });
      logger.info(`Anagrafica: ${rows.length} righe`);
      await supabaseAdmin.from("importazioni").update({ righe_totali: rows.length, stato: "in_elaborazione" }).eq("id", importazioneId);
      if (!rows.length) { await update("completata_con_errori", true); return { rows: 0 }; }

      const { stores, storesByIndex } = await step.run("load-stores", async () => {
        const { data } = await supabaseAdmin.from("stores").select("id, codice").order("codice");
        const map: Record<string, string> = {};
        (data ?? []).forEach((s) => { if (s.codice) map[s.codice] = s.id; });
        return { stores: map, storesByIndex: data ?? [] };
      });

      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale).filter(Boolean)));
      const pive = Array.from(new Set(rows.map((r) => r.partita_iva).filter(Boolean)));
      const existing = await step.run("lookup-existing", async () => {
        const map: Record<string, string> = {};
        if (codici.length) {
          const { data } = await supabaseAdmin.from("clienti").select("id, codice_gestionale").in("codice_gestionale", codici);
          (data ?? []).forEach((c) => { if (c.codice_gestionale) map[`cg:${c.codice_gestionale}`] = c.id; });
        }
        if (pive.length) {
          const { data } = await supabaseAdmin.from("clienti").select("id, partita_iva").in("partita_iva", pive);
          (data ?? []).forEach((c) => { if (c.partita_iva) map[`pi:${c.partita_iva}`] = c.id; });
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
          if (!storeId) errorLog.push({ riga: r.__row, errore: `Store '${r.store_codice}' non trovato (warning)` });
        }
        const payload: Record<string, unknown> = {
          ragione_sociale: r.ragione_sociale,
          codice_gestionale: toStr(r.codice_gestionale), partita_iva: toStr(r.partita_iva),
          codice_fiscale: toStr(r.codice_fiscale), tipo_soggetto: toStr(r.forma_giuridica),
          indirizzo: toStr(r.indirizzo), citta: toStr(r.citta), cap: toStr(r.cap), provincia: toStr(r.provincia),
          telefono: toStr(r.telefono), email: toStr(r.email), pec: toStr(r.pec),
          codice_sdi: toStr(r.codice_sdi), note: toStr(r.note),
        };
        if (storeId) payload.store_id = storeId;
        const existId = (r.codice_gestionale && existing[`cg:${r.codice_gestionale}`]) ||
          (r.partita_iva && existing[`pi:${r.partita_iva}`]) || null;
        prepared.push({ idx: r.__row, payload, existId });
      }

      const toInsert = prepared.filter((p) => !p.existId);
      const toUpdate = prepared.filter((p) => p.existId);
      const BATCH = 100;

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const res = await step.run(`insert-batch-${i}`, async () => {
          const { data, error } = await supabaseAdmin.from("clienti").insert(chunk.map((c) => c.payload) as never).select("id");
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
        await update("in_elaborazione");
      }

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        const res = await step.run(`update-batch-${i}`, async () => {
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
  { id: "process-rischio-import", name: "Process rischio import", retries: 2,
    triggers: [{ event: "import/analisi_rischio.requested" }] },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    try {
      const { rows, missing } = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        return parseRischioSheet(wb.Sheets[wb.SheetNames[0]]);
      });
      logger.info(`Rischio: ${rows.length} righe, ${missing.length} senza codice`);

      const errorLog: Array<{ riga: number; errore: string }> = missing.map((idx) => ({ riga: idx, errore: "Codice gestionale mancante" }));
      let updated = 0;

      await supabaseAdmin.from("importazioni").update({
        righe_totali: rows.length + missing.length, stato: "in_elaborazione",
      }).eq("id", importazioneId);

      const codici = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
      const map = new Map<string, string>();
      if (codici.length) {
        const { data } = await supabaseAdmin.from("clienti").select("id, codice_gestionale").in("codice_gestionale", codici);
        (data ?? []).forEach((c) => { if (c.codice_gestionale) map.set(c.codice_gestionale, c.id); });
      }

      const now = new Date().toISOString();
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await step.run(`update-batch-${i}`, async () => {
          let ok = 0; const errs: Array<{ riga: number; errore: string }> = [];
          await Promise.all(chunk.map(async (r) => {
            const id = map.get(r.codice_gestionale);
            if (!id) { errs.push({ riga: r.idx, errore: `Codice ${r.codice_gestionale} non trovato${r.ragione_sociale ? ` (${r.ragione_sociale})` : ""}` }); return; }
            const { error } = await supabaseAdmin.from("clienti").update({ ...r.payload, ultima_sincronizzazione: now } as never).eq("id", id);
            if (error) errs.push({ riga: r.idx, errore: `Update: ${error.message}` });
            else ok++;
          }));
          return { ok, errs };
        });
        updated += res.ok;
        errorLog.push(...res.errs);
        await supabaseAdmin.from("importazioni").update({
          righe_elaborate: Math.min(i + BATCH, rows.length),
          righe_aggiornate: updated, righe_errore: errorLog.length,
          stato: "in_elaborazione",
        }).eq("id", importazioneId);
      }

      await supabaseAdmin.from("importazioni").update({
        righe_elaborate: rows.length, righe_create: 0, righe_aggiornate: updated,
        righe_errore: errorLog.length,
        stato: errorLog.length ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
      }).eq("id", importazioneId);

      return { updated, errors: errorLog.length };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);

/* ============================================================================
 * C — SCADENZIARIO (semplice)
 * ============================================================================ */

export const processScadenziarioImport = inngest.createFunction(
  { id: "process-scadenziario-import", name: "Process scadenziario import", retries: 2,
    triggers: [{ event: "import/scadenziario.requested" }] },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath, userId } = event.data as EventData;
    const CHUNK_SIZE = 500;
    try {
      // STEP 1 — parse + stage su storage (output dello step: solo metadata leggero)
      const stage = await step.run("parse-and-stage", async () => {
        const wb = await downloadWorkbook(filePath);
        const sheet = findSheetByName(wb, "SCADENZIARIO");
        if (!sheet) throw new Error("Foglio SCADENZIARIO non trovato nel file");
        const { rows, missing, totRead } = parseScadenziarioOfficialSheet(sheet);
        const codiciAll = Array.from(new Set(rows.map((r) => r.codice_gestionale)));
        const chunkCount = Math.ceil(rows.length / CHUNK_SIZE);
        for (let i = 0; i < chunkCount; i++) {
          const slice = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const path = `_staging/${importazioneId}/chunk-${i}.json`;
          const body = new Blob([JSON.stringify(slice)], { type: "application/json" });
          const { error } = await supabaseAdmin.storage.from("import-files").upload(path, body, { upsert: true, contentType: "application/json" });
          if (error) throw new Error(`Staging chunk ${i}: ${error.message}`);
        }
        return { totRead, totRows: rows.length, missing, chunkCount, codici: codiciAll };
      });
      const { totRead, totRows, missing, chunkCount, codici } = stage;
      logger.info(`Scadenziario stage: ${totRows}/${totRead} righe in ${chunkCount} chunk`);

      const errorLog: Array<{ riga: number; errore: string }> = missing.map((idx: number) => ({ riga: idx, errore: "COD_CLI mancante" }));
      let created = 0;
      let updated = 0;

      await supabaseAdmin.from("importazioni").update({
        righe_totali: totRead, righe_elaborate: 0, stato: "in_elaborazione",
      }).eq("id", importazioneId);

      // STEP 2 — lookup clienti (output piccolo)
      const clientMap = await step.run("lookup-clienti", async () => {
        const out: Record<string, string> = {};
        if (!codici.length) return out;
        const BATCH_LOOKUP = 500;
        for (let i = 0; i < codici.length; i += BATCH_LOOKUP) {
          const slice = codici.slice(i, i + BATCH_LOOKUP);
          const { data } = await supabaseAdmin.from("clienti").select("id, codice_gestionale").in("codice_gestionale", slice as string[]);
          (data ?? []).forEach((c) => { if (c.codice_gestionale) out[c.codice_gestionale] = c.id; });
        }
        return out;
      });

      // STEP 3 — processa ogni chunk separatamente
      const matchedClientIds = new Set<string>();
      let elaborate = 0;
      for (let ci = 0; ci < chunkCount; ci++) {
        const res = await step.run(`process-chunk-${ci}`, async () => {
          const path = `_staging/${importazioneId}/chunk-${ci}.json`;
          const { data: file, error } = await supabaseAdmin.storage.from("import-files").download(path);
          if (error || !file) throw new Error(`Download chunk ${ci}: ${error?.message}`);
          const slice = JSON.parse(await file.text()) as Array<{ idx: number; codice_gestionale: string; ragione_sociale: string; payload: Record<string, unknown> }>;

          // lookup esistenti per i clienti di questo chunk
          const cids = Array.from(new Set(slice.map((r) => clientMap[r.codice_gestionale]).filter(Boolean) as string[]));
          const existingMap = new Map<string, string>();
          if (cids.length) {
            const { data } = await supabaseAdmin.from("scadenze" as never)
              .select("id, cliente_id, numero_documento, sezionale")
              .in("cliente_id", cids);
            ((data ?? []) as Array<{ id: string; cliente_id: string; numero_documento: string | null; sezionale: string | null }>).forEach((s) => {
              existingMap.set(`${s.cliente_id}|${s.numero_documento ?? ""}|${s.sezionale ?? ""}`, s.id);
            });
          }
          const now = new Date().toISOString();
          let c = 0, u = 0;
          const errs: Array<{ riga: number; errore: string }> = [];
          const matched: string[] = [];
          for (const r of slice) {
            const cid = clientMap[r.codice_gestionale];
            if (!cid) { errs.push({ riga: r.idx, errore: `Cliente ${r.codice_gestionale} non trovato${r.ragione_sociale ? ` (${r.ragione_sociale})` : ""}` }); continue; }
            matched.push(cid);
            const p = r.payload;
            const key = `${cid}|${(p.numero_documento as string) ?? ""}|${(p.sezionale as string) ?? ""}`;
            const existId = existingMap.get(key);
            const row = { ...p, cliente_id: cid, importato_da: userId ?? null, ultima_sincronizzazione: now };
            if (existId) {
              const { error: e } = await supabaseAdmin.from("scadenze" as never).update(row as never).eq("id", existId);
              if (e) errs.push({ riga: r.idx, errore: `Update: ${e.message}` }); else u++;
            } else {
              const { error: e } = await supabaseAdmin.from("scadenze" as never).insert(row as never);
              if (e) errs.push({ riga: r.idx, errore: `Insert: ${e.message}` }); else c++;
            }
          }
          return { c, u, errs, matched, count: slice.length };
        });
        created += res.c;
        updated += res.u;
        errorLog.push(...res.errs);
        res.matched.forEach((id) => matchedClientIds.add(id));
        elaborate += res.count;
        await supabaseAdmin.from("importazioni").update({
          righe_elaborate: elaborate,
          righe_create: created, righe_aggiornate: updated, righe_errore: errorLog.length,
          stato: "in_elaborazione",
        }).eq("id", importazioneId);
      }

      // STEP 4 — cleanup staging (best-effort, non fa fallire l'import)
      await step.run("cleanup-staging", async () => {
        const paths = Array.from({ length: chunkCount }, (_, i) => `_staging/${importazioneId}/chunk-${i}.json`);
        if (paths.length) await supabaseAdmin.storage.from("import-files").remove(paths);
        return { removed: paths.length };
      });

      logger.info(`Scadenziario completato: lette=${totRead}, clienti abbinati=${matchedClientIds.size}, create=${created}, aggiornate=${updated}, saltate=${errorLog.length}`);

      await supabaseAdmin.from("importazioni").update({
        righe_elaborate: totRead, righe_create: created, righe_aggiornate: updated,
        righe_errore: errorLog.length,
        stato: errorLog.length ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        log_errori: errorLog.length ? errorLog.slice(0, 500) : null,
      }).eq("id", importazioneId);

      return { created, updated, errors: errorLog.length };
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
  { id: "process-scad-assic-import", name: "Process scadenziario+assicurazioni import", retries: 2,
    triggers: [{ event: "import/scadenziario_assicurazioni.requested" }] },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath, userId } = event.data as EventData;
    try {
      const parsed = await step.run("parse", async () => {
        const wb = await downloadWorkbook(filePath);
        const findSheet = (kw: string) => {
          const name = wb.SheetNames.find((n) => normalize(n) === normalize(kw))
            ?? wb.SheetNames.find((n) => normalize(n).includes(normalize(kw)));
          return name ? wb.Sheets[name] : null;
        };
        const sScad = findSheet("scadenziario");
        const sAssic = findSheet("assicurazione");
        const warnings: string[] = [];
        let scadRows: Awaited<ReturnType<typeof parseScadenziarioBlockSheet>>["rows"] = [];
        let scadTot = 0;
        if (!sScad) warnings.push("Foglio 'SCADENZIARIO' non trovato.");
        else { const r = parseScadenziarioBlockSheet(sScad); scadRows = r.rows; scadTot = r.totRead; }
        const assicRows = sAssic ? parseAssicurazioneSheet(sAssic) : [];
        if (!sAssic) warnings.push("Foglio 'ASSICURAZIONE' non trovato.");
        return { scadRows, assicRows, scadTot, warnings };
      });

      const { scadRows, assicRows, scadTot, warnings } = parsed;
      logger.info(`Scad+Assic: ${scadRows.length} scadenze, ${assicRows.length} polizze`);

      const log: string[] = [...warnings];
      await supabaseAdmin.from("importazioni").update({
        righe_totali: scadRows.length + assicRows.length, stato: "in_elaborazione",
      }).eq("id", importazioneId);

      const allCodes = Array.from(new Set([...scadRows.map((r) => r.cod_cli), ...assicRows.map((r) => r.cod_cli)]));
      const clientMap = new Map<string, string>();
      if (allCodes.length) {
        const { data } = await supabaseAdmin.from("clienti").select("id, codice_gestionale").in("codice_gestionale", allCodes);
        (data ?? []).forEach((c) => { if (c.codice_gestionale) clientMap.set(String(c.codice_gestionale), c.id); });
      }
      const clientIds = Array.from(new Set(Array.from(clientMap.values())));

      // pre-load scadenze esistenti
      const existingScad = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin.from("scadenze" as never)
          .select("id, cliente_id, data_scadenza, descrizione_pagamento").in("cliente_id", clientIds);
        ((data ?? []) as Array<{ id: string; cliente_id: string; data_scadenza: string | null; descrizione_pagamento: string | null }>).forEach((s) => {
          existingScad.set(`${s.cliente_id}|${s.data_scadenza ?? ""}|${s.descrizione_pagamento ?? ""}`, s.id);
        });
      }

      // pre-load solleciti
      const existingSoll = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin.from("solleciti" as never)
          .select("cliente_id, nota").in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; nota: string }>).forEach((s) => {
          existingSoll.add(`${s.cliente_id}|${(s.nota ?? "").trim()}`);
        });
      }

      // pre-load pratiche legali aperte
      const openLegale = new Set<string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin.from("pratiche_legali" as never)
          .select("cliente_id, stato").in("cliente_id", clientIds);
        ((data ?? []) as Array<{ cliente_id: string; stato: string }>).forEach((p) => {
          if (p.stato !== "chiusa") openLegale.add(p.cliente_id);
        });
      }

      let scadCreated = 0, scadUpdated = 0, scadSkipped = 0;
      const matchedClients = new Set<string>();
      const clientsToBlock = new Set<string>();
      const clientsLegale = new Set<string>();
      const now = new Date().toISOString();

      const BATCH = 40;
      for (let i = 0; i < scadRows.length; i += BATCH) {
        const chunk = scadRows.slice(i, i + BATCH);
        const res = await step.run(`scad-batch-${i}`, async () => {
          let c = 0, u = 0, s = 0; const logs: string[] = [];
          const block: string[] = []; const legale: string[] = [];
          for (const r of chunk) {
            const cid = clientMap.get(r.cod_cli);
            if (!cid) { s++; logs.push(`Riga ${r.excelRow}: cliente ${r.cod_cli} non trovato`); continue; }
            matchedClients.add(cid);
            const key = `${cid}|${r.data_scadenza ?? ""}|${r.descrizione_pagamento ?? ""}`;
            const existId = existingScad.get(key);
            const payload: Record<string, unknown> = {
              cliente_id: cid, data_scadenza: r.data_scadenza,
              descrizione_pagamento: r.descrizione_pagamento,
              importo_scadenza: r.importo_scadenza, fido_euro: r.fido_euro,
              assicurazione: r.assicurazione, cod_blocco: r.cod_blocco,
              importato_da: userId ?? null, ultima_sincronizzazione: now,
            };
            if (existId) {
              const { error } = await supabaseAdmin.from("scadenze" as never).update(payload as never).eq("id", existId);
              if (error) { s++; logs.push(`Riga ${r.excelRow}: ${error.message}`); } else u++;
            } else {
              const { error } = await supabaseAdmin.from("scadenze" as never).insert(payload as never);
              if (error) { s++; logs.push(`Riga ${r.excelRow}: ${error.message}`); } else c++;
            }
            if (r.bloccato) block.push(cid);
            if (r.note_solleciti) {
              const dkey = `${cid}|${r.note_solleciti.trim()}`;
              if (!existingSoll.has(dkey)) {
                const { error } = await supabaseAdmin.from("solleciti" as never).insert({
                  cliente_id: cid, tipo: "interno", nota: r.note_solleciti, inserito_da: userId ?? null,
                } as never);
                if (!error) existingSoll.add(dkey);
                else logs.push(`Riga ${r.excelRow}: sollecito ${error.message}`);
              }
            }
            if (r.note_legale && !openLegale.has(cid) && !clientsLegale.has(cid)) {
              const { error } = await supabaseAdmin.from("pratiche_legali" as never).insert({
                cliente_id: cid, tipo: "azione_legale_generica", stato: "aperta",
                note: r.note_legale, gestita_da: userId ?? null,
              } as never);
              if (!error) { openLegale.add(cid); clientsLegale.add(cid); legale.push(cid); }
              else logs.push(`Riga ${r.excelRow}: pratica legale ${error.message}`);
            }
          }
          return { c, u, s, logs, block, legale };
        });
        scadCreated += res.c; scadUpdated += res.u; scadSkipped += res.s;
        log.push(...res.logs);
        res.block.forEach((id) => clientsToBlock.add(id));
        res.legale.forEach((id) => clientsLegale.add(id));
        await supabaseAdmin.from("importazioni").update({
          righe_elaborate: Math.min(i + BATCH, scadRows.length),
          righe_create: scadCreated, righe_aggiornate: scadUpdated, righe_errore: scadSkipped,
          stato: "in_elaborazione",
        }).eq("id", importazioneId);
      }

      if (clientsToBlock.size) {
        await supabaseAdmin.from("clienti").update({
          bloccato: true, data_blocco: now, motivo_blocco: "Import scadenziario: T_BLOCCO=BLOCCATO",
        } as never).in("id", Array.from(clientsToBlock));
      }

      // ASSICURAZIONI
      let assicCreated = 0, assicUpdated = 0, assicSkipped = 0;
      const assicClients = new Set<string>();
      const existingPol = new Map<string, string>();
      if (clientIds.length) {
        const { data } = await supabaseAdmin.from("assicurazioni_credito" as never)
          .select("id, cliente_id").in("cliente_id", clientIds);
        ((data ?? []) as Array<{ id: string; cliente_id: string }>).forEach((p) => {
          if (!existingPol.has(p.cliente_id)) existingPol.set(p.cliente_id, p.id);
        });
      }

      for (let i = 0; i < assicRows.length; i += BATCH) {
        const chunk = assicRows.slice(i, i + BATCH);
        const res = await step.run(`assic-batch-${i}`, async () => {
          let c = 0, u = 0, s = 0; const logs: string[] = []; const clients: string[] = [];
          for (const a of chunk) {
            const cid = clientMap.get(a.cod_cli);
            if (!cid) { s++; logs.push(`Assic riga ${a.excelRow}: cliente ${a.cod_cli} non trovato`); continue; }
            clients.push(cid);
            const payload: Record<string, unknown> = {
              cliente_id: cid, assicuratore: "POUEY",
              data_inizio: a.data_inizio, data_scadenza: a.data_scadenza,
              importo_assicurato: a.importo_assicurato, importo_massimale: a.importo_assicurato,
              stato: "attiva",
            };
            const existId = existingPol.get(cid);
            if (existId) {
              const { error } = await supabaseAdmin.from("assicurazioni_credito" as never).update(payload as never).eq("id", existId);
              if (error) { s++; logs.push(`Assic riga ${a.excelRow}: ${error.message}`); } else u++;
            } else {
              const { error } = await supabaseAdmin.from("assicurazioni_credito" as never).insert(payload as never);
              if (error) { s++; logs.push(`Assic riga ${a.excelRow}: ${error.message}`); }
              else { c++; existingPol.set(cid, "new"); }
            }
          }
          return { c, u, s, logs, clients };
        });
        assicCreated += res.c; assicUpdated += res.u; assicSkipped += res.s;
        log.push(...res.logs);
        res.clients.forEach((id) => assicClients.add(id));
      }

      if (assicClients.size) {
        await supabaseAdmin.from("clienti").update({ assicurazione_attiva: true } as never)
          .in("id", Array.from(assicClients));
      }

      const summary = [
        `SCADENZIARIO: lette ${scadTot}, abbinati ${matchedClients.size} clienti, ${scadCreated} create, ${scadUpdated} aggiornate, ${scadSkipped} saltate`,
        `ASSICURAZIONI: lette ${assicRows.length}, ${assicCreated} create, ${assicUpdated} aggiornate, ${assicSkipped} saltate`,
        `Clienti bloccati: ${clientsToBlock.size}, pratiche legali create: ${clientsLegale.size}`,
      ];
      const fullLog = [...summary, ...log];

      await supabaseAdmin.from("importazioni").update({
        righe_elaborate: scadRows.length + assicRows.length,
        righe_create: scadCreated + assicCreated,
        righe_aggiornate: scadUpdated + assicUpdated,
        righe_errore: scadSkipped + assicSkipped,
        stato: (scadSkipped + assicSkipped) > 0 ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        log_errori: fullLog.length ? fullLog.slice(0, 500).map((m) => ({ messaggio: m })) : null,
      }).eq("id", importazioneId);

      return { scadCreated, scadUpdated, assicCreated, assicUpdated };
    } catch (err) {
      await setImportazioneError(importazioneId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);
