import { inngest } from "../client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadWorkbook, chiudiImportazione, resetAnomalieAperteFonte } from "../functions.server";
import { pulisciFileTemporaneiImport } from "../pulizia-file-import.server";
import { GESTORI_LISTINI_GAMMA } from "./gestori.server";
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
    const staging = (chiave: string) => `_staging/${importazioneId}/listini-${chiave}.json`;

    const parse = await step.run("parse", async () => {
      const wb = await downloadWorkbook(filePath);
      const usati = new Set<string>();
      const fogli: Record<string, { foglio: string; righe: number; righeLette: number; anomalie: number; meta: Record<string, unknown> }> = {};
      for (const g of GESTORI_LISTINI_GAMMA) {
        const f = g.trovaFoglio(wb);
        if (!f) continue;
        usati.add(f.nome);
        const p = g.prepara(f.sheet);
        const { error } = await supabaseAdmin.storage
          .from("import-files")
          .upload(staging(g.chiave), new Blob([JSON.stringify(p.righe)], { type: "application/json" }), {
            contentType: "application/json",
            upsert: true,
          });
        if (error) throw new Error(`staging ${g.chiave}: ${error.message}`);
        fogli[g.chiave] = { foglio: f.nome, righe: p.righe.length, righeLette: p.righeLette, anomalie: p.anomalie, meta: p.meta };
      }
      return { fogli, nonGestiti: wb.SheetNames.filter((n) => !usati.has(n)) };
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
            righe_elaborate: fs.reduce((s, f) => s + (f.stato === "completato" ? f.righe : Math.min(f.righe, f.lotto * 500)), 0),
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
          step,
          importazioneId,
          stagingPath: staging(g.chiave),
          meta: { ...f.meta, __righe: f.righe },
          log: (m) => logger.warn(m),
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
