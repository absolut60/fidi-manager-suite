import { inngest } from "../client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as XLSX from "xlsx";
import { downloadJsonConRetry, chiudiImportazione, resetAnomalieAperteFonte } from "../functions.server";
import { pulisciFileTemporaneiImport } from "../pulizia-file-import.server";
import { GESTORI_LISTINI_GAMMA, type StepApi } from "./gestori.server";
import { CHIAVE_STATO_LISTINI, type StatoFoglio, type StatoImportListini } from "./tipi";

const FONTE = "articoli_listini_gamma";
type EventData = { importazioneId: string; filePath: string };

/**
 * Import unico del file MADE_ARTICOLI_LISTINI_PQ.xlsx: legge il file una volta,
 * poi esegue i gestori registrati in ordine fisso. Un foglio che fallisce
 * (dopo i retry dei suoi step) non ferma gli altri.
 */
export const processArticoliListiniGammaImport = inngest.createFunction(
  {
    id: "process-articoli-listini-gamma-import",
    name: "Process articoli, fornitori e listini Gamma import",
    retries: 3,
    timeouts: { finish: "30m" },
    triggers: [{ event: `import/${FONTE}.requested` }],
    onFailure: async ({ event, error }) => {
      const d = (event.data as { event?: { data?: EventData } }).event?.data;
      if (!d?.importazioneId) return;
      await chiudiImportazione(
        d.importazioneId,
        {
          stato: "fallita",
          completata_at: new Date().toISOString(),
          log_errori: [{ riga: 0, errore: `Errore fatale: ${error.message}` }],
          problemi: [`Errore fatale: ${error.message}`],
        },
        { soloSeStato: "in_elaborazione" },
      );
    },
  },
  async ({ event, step, logger }) => {
    const { importazioneId, filePath } = event.data as EventData;
    const dir = `_staging/${importazioneId}`;
    const fileLotto = (chiave: string, i: number) => `${dir}/listini-${chiave}-${String(i).padStart(3, "0")}.json`;
    const fileExtra = (chiave: string, nome: "anomalie" | "codici") => `${dir}/listini-${chiave}-${nome}.json`;
    const carica = async (path: string, body: unknown) => {
      const { error } = await supabaseAdmin.storage
        .from("import-files")
        .upload(path, new Blob([JSON.stringify(body)], { type: "application/json" }), {
          contentType: "application/json",
          upsert: true,
        });
      if (error) throw new Error(`staging ${path}: ${error.message}`);
    };

    // Lettura unica del file: prima solo i nomi dei fogli, poi soltanto quelli con un gestore.
    const parse = await step.run("parse", async () => {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("import-files").download(filePath);
      if (dlErr || !blob) throw new Error(`Download fallito: ${dlErr?.message ?? "no data"}`);
      const buf = await blob.arrayBuffer();
      const nomi = XLSX.read(buf, { type: "array", bookSheets: true }).SheetNames;
      const vuoto = { SheetNames: nomi, Sheets: {} } as unknown as XLSX.WorkBook;
      const voluti = GESTORI_LISTINI_GAMMA.map((g) => g.trovaFoglio({ ...vuoto, Sheets: Object.fromEntries(nomi.map((n) => [n, {}])) } as XLSX.WorkBook)?.nome).filter(Boolean) as string[];
      const wb = voluti.length
        ? XLSX.read(buf, { type: "array", sheets: voluti, cellFormula: false, cellHTML: false, cellStyles: false, cellText: false })
        : vuoto;
      const usati = new Set<string>();
      const fogli: Record<string, { foglio: string; righe: number; righeLette: number; anomalie: number; lotti: number; lotto: number; meta: Record<string, unknown> }> = {};
      for (const g of GESTORI_LISTINI_GAMMA) {
        const f = g.trovaFoglio(wb);
        if (!f) continue;
        usati.add(f.nome);
        const p = g.prepara(f.sheet);
        const lotti = Math.ceil(p.righe.length / g.lotto);
        for (let i = 0; i < lotti; i++) await carica(fileLotto(g.chiave, i), p.righe.slice(i * g.lotto, (i + 1) * g.lotto));
        await carica(fileExtra(g.chiave, "anomalie"), p.anomalie);
        await carica(fileExtra(g.chiave, "codici"), p.codici);
        fogli[g.chiave] = { foglio: f.nome, righe: p.righe.length, righeLette: p.righeLette, anomalie: p.anomalie.length, lotti, lotto: g.lotto, meta: p.meta };
      }
      return { fogli, nonGestiti: nomi.filter((n) => !usati.has(n)) };
    });

    await step.run("reset-anomalie-aperte-fonte", () => resetAnomalieAperteFonte(FONTE, importazioneId));

    // Stato per foglio: ricostruito in modo deterministico dai risultati memoizzati.
    const stato: StatoImportListini = { fogli: {}, non_gestiti: parse.nonGestiti };
    for (const g of GESTORI_LISTINI_GAMMA) {
      const f = parse.fogli[g.chiave];
      if (!f) continue;
      stato.fogli[g.chiave] = {
        etichetta: g.etichetta, foglio: f.foglio, stato: "in_attesa", righe: f.righe,
        lotto: 0, lotti: 0, conteggi: {}, anomalie: f.anomalie,
      };
    }
    const totaleRighe = Object.values(stato.fogli).reduce((s, f) => s + f.righe, 0);
    const scrivi = (id: string) =>
      step.run(id, async () => {
        const fs = Object.values(stato.fogli);
        const somma = (k: string) => fs.reduce((s, f) => s + (f.conteggi[k] ?? 0), 0);
        const { error } = await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: totaleRighe,
            righe_attese: totaleRighe,
            righe_elaborate: Object.entries(stato.fogli).reduce((s, [k, f]) => s + (f.stato === "completato" ? f.righe : Math.min(f.righe, f.lotto * (parse.fogli[k]?.lotto ?? 500))), 0),
            righe_create: somma("inseriti"),
            righe_aggiornate: somma("aggiornati"),
            righe_errore: fs.reduce((s, f) => s + f.anomalie, 0),
            report_saltati: { [CHIAVE_STATO_LISTINI]: stato },
          } as never)
          .eq("id", importazioneId);
        if (error) throw new Error(`stato import: ${error.message}`);
      });

    await scrivi("stato-iniziale");

    for (const g of GESTORI_LISTINI_GAMMA) {
      const f = parse.fogli[g.chiave];
      const sf = stato.fogli[g.chiave];
      if (!f || !sf) continue;
      sf.stato = "in_corso";
      try {
        const conteggi = await g.esegui({
          step: step as unknown as StepApi,
          importazioneId,
          lotti: f.lotti,
          meta: f.meta,
          leggiLotto: <T,>(i: number) => downloadJsonConRetry<T[]>(fileLotto(g.chiave, i), `${g.chiave} lotto ${i + 1}`, (m) => logger.warn(m)),
          leggiAnomalie: <T,>() => downloadJsonConRetry<T[]>(fileExtra(g.chiave, "anomalie"), `${g.chiave} anomalie`, (m) => logger.warn(m)),
          leggiCodici: <T,>() => downloadJsonConRetry<T[]>(fileExtra(g.chiave, "codici"), `${g.chiave} codici`, (m) => logger.warn(m)),
          avanzamento: async (lotto, lotti, c) => {
            sf.lotto = lotto;
            sf.lotti = lotti;
            sf.conteggi = c;
            await scrivi(`stato-${g.chiave}-${String(lotto).padStart(3, "0")}`);
          },
        });
        sf.conteggi = conteggi;
        sf.stato = "completato";
      } catch (e) {
        sf.stato = "errore";
        sf.errore = e instanceof Error ? e.message : String(e);
        logger.error(`foglio ${g.chiave} fallito: ${sf.errore}`);
      }
      await scrivi(`stato-${g.chiave}-fine`);
    }

    await step.run("finalize", async () => {
      const fs = Object.values(stato.fogli);
      const n = (x: number) => x.toLocaleString("it-IT");
      const problemi: string[] = [];
      if (!fs.length) problemi.push("Nessun foglio riconosciuto nel file");
      for (const f of fs) {
        if (f.stato === "errore") problemi.push(`${f.etichetta}: non completato (${f.errore ?? "errore"})`);
        if (f.anomalie) problemi.push(`${f.etichetta}: ${n(f.anomalie)} anomalie, vedi Anomalie import`);
      }
      const log = fs.map((f: StatoFoglio) => ({
        riga: 0,
        errore: `${f.etichetta} (${f.foglio}): ${f.stato === "completato" ? "completato" : "errore"} · ${Object.entries(f.conteggi).map(([k, v]) => `${k.replace(/_/g, " ")} ${n(v)}`).join(" · ")}`,
      }));
      if (stato.non_gestiti.length) log.push({ riga: 0, errore: `Fogli non ancora gestiti: ${stato.non_gestiti.join(", ")}` });
      await chiudiImportazione(importazioneId, {
        stato: problemi.length ? "completata_con_errori" : "completata",
        completata_at: new Date().toISOString(),
        report_saltati: { [CHIAVE_STATO_LISTINI]: stato },
        log_errori: log,
        problemi,
      });
      if (!fs.some((f) => f.stato === "errore")) await pulisciFileTemporaneiImport(importazioneId).catch(() => undefined);
    });

    return stato;
  },
);
