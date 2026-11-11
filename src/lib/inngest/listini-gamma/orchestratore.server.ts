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
 * Import unico del file MADE_ARTICOLI_LISTINI_PQ.xlsx: step "fogli" legge solo i nomi,
 * poi per ogni gestore uno step "parse-<chiave>" legge solo il suo foglio; quindi i
 * gestori eseguono i loro step in ordine fisso. Un foglio che fallisce
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

    const scaricaFile = async () => {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("import-files").download(filePath);
      if (dlErr || !blob) throw new Error(`Download fallito: ${dlErr?.message ?? "no data"}`);
      return blob.arrayBuffer();
    };
    /** Carica in parallelo a gruppi (non in sequenza, non tutto insieme). */
    const caricaAGruppi = async (voci: Array<[string, unknown]>, gruppo = 8) => {
      for (let i = 0; i < voci.length; i += gruppo) {
        await Promise.all(voci.slice(i, i + gruppo).map(([path, body]) => carica(path, body)));
      }
    };

    // Step leggero: solo i nomi dei fogli (nessuna cella letta). Decide quali gestori eseguire.
    const elenco = await step.run("fogli", async () => {
      const nomi = XLSX.read(await scaricaFile(), { type: "array", bookSheets: true }).SheetNames;
      const finto = { SheetNames: nomi, Sheets: Object.fromEntries(nomi.map((n) => [n, {}])) } as unknown as XLSX.WorkBook;
      const assegnati: Record<string, string> = {};
      for (const g of GESTORI_LISTINI_GAMMA) {
        const nome = g.trovaFoglio(finto)?.nome;
        if (nome) assegnati[g.chiave] = nome;
      }
      const usati = new Set(Object.values(assegnati));
      return { assegnati, nonGestiti: nomi.filter((n) => !usati.has(n)) };
    });

    // Uno step per gestore: riscarica il file e legge SOLO il proprio foglio.
    type InfoFoglio = { foglio: string; righe: number; righeLette: number; anomalie: number; lotti: number; lotto: number; meta: Record<string, unknown> };
    const parse: { fogli: Record<string, InfoFoglio>; nonGestiti: string[]; erroriLettura: Record<string, string> } = {
      fogli: {}, nonGestiti: elenco.nonGestiti, erroriLettura: {},
    };
    for (const g of GESTORI_LISTINI_GAMMA) {
      const nome = elenco.assegnati[g.chiave];
      if (!nome) continue;
      try {
        parse.fogli[g.chiave] = await step.run(`parse-${g.chiave}`, async (): Promise<InfoFoglio> => {
          let wb: XLSX.WorkBook | null = XLSX.read(await scaricaFile(), {
            type: "array", sheets: [nome], dense: true,
            cellFormula: false, cellHTML: false, cellStyles: false, cellText: false,
          });
          const sheet = wb.Sheets[nome];
          if (!sheet) throw new Error(`Foglio ${nome} non leggibile`);
          const p = g.prepara(sheet);
          wb = null; // libera il foglio prima di caricare lo staging
          const lotti = Math.ceil(p.righe.length / g.lotto);
          const voci: Array<[string, unknown]> = [];
          for (let i = 0; i < lotti; i++) voci.push([fileLotto(g.chiave, i), p.righe.slice(i * g.lotto, (i + 1) * g.lotto)]);
          voci.push([fileExtra(g.chiave, "anomalie"), p.anomalie], [fileExtra(g.chiave, "codici"), p.codici]);
          await caricaAGruppi(voci);
          return { foglio: nome, righe: p.righe.length, righeLette: p.righeLette, anomalie: p.anomalie.length, lotti, lotto: g.lotto, meta: p.meta };
        });
      } catch (e) {
        // Lettura del foglio fallita dopo i retry: gli altri fogli proseguono.
        parse.erroriLettura[g.chiave] = e instanceof Error ? e.message : String(e);
        logger.error(`lettura foglio ${g.chiave} fallita: ${parse.erroriLettura[g.chiave]}`);
      }
    }

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
    for (const [chiave, errore] of Object.entries(parse.erroriLettura)) {
      const g = GESTORI_LISTINI_GAMMA.find((x) => x.chiave === chiave)!;
      stato.fogli[chiave] = {
        etichetta: g.etichetta, foglio: elenco.assegnati[chiave], stato: "errore", righe: 0,
        lotto: 0, lotti: 0, conteggi: {}, anomalie: 0, errore: `Lettura del foglio non riuscita: ${errore}`,
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
