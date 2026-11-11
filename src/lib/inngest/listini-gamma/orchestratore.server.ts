import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadJsonConRetry, chiudiImportazione, resetAnomalieAperteFonte } from "../functions.server";
import { pulisciFileTemporaneiImport } from "../pulizia-file-import.server";
import { GESTORI_LISTINI_GAMMA, type StepApi } from "./gestori.server";
import {
  PREPARATORI_LISTINI_GAMMA,
  fileLottoListini,
  fileExtraListini,
  type ManifestListini,
} from "@/lib/listini-gamma-parser";
import { CHIAVE_STATO_LISTINI, type StatoFoglio, type StatoImportListini } from "./tipi";

const FONTE = "articoli_listini_gamma";
type EventData = { importazioneId: string; filePath: string; listini?: ManifestListini };

/**
 * Import unico del file MADE_ARTICOLI_LISTINI_PQ.xlsx. Il server NON apre lo xlsx: la
 * pagina lo legge nel browser (listini-gamma-parser) e carica in _staging/<id>/ i JSON già
 * divisi per foglio e pacchetto; l'evento porta l'elenco dei fogli e dei pacchetti.
 * Qui si leggono solo quei JSON, un pacchetto per step, in ordine fisso di foglio.
 * Un foglio che fallisce non ferma gli altri.
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
    const { importazioneId, listini } = event.data as EventData;
    if (!listini || !Array.isArray(listini.fogli)) {
      throw new NonRetriableError("File non preparato dalla pagina: ricarica il file da Import/Export e riavvia l'import");
    }
    const dir = `_staging/${importazioneId}`;
    const leggi = <T,>(nome: string, label: string) =>
      downloadJsonConRetry<T>(`${dir}/${nome}`, label, (m) => logger.warn(m));

    const preparati = new Map(listini.fogli.map((f) => [f.chiave, f]));

    await step.run("reset-anomalie-aperte-fonte", () => resetAnomalieAperteFonte(FONTE, importazioneId));

    // Stato per foglio: deterministico dall'evento (stesso a ogni ripresa).
    const stato: StatoImportListini = { fogli: {}, non_gestiti: listini.nonGestiti ?? [] };
    for (const p of PREPARATORI_LISTINI_GAMMA) {
      const f = preparati.get(p.chiave);
      if (!f) continue;
      stato.fogli[p.chiave] = f.errore
        ? { etichetta: p.etichetta, foglio: f.foglio, stato: "errore", righe: 0, lotto: 0, lotti: 0, conteggi: {}, anomalie: 0,
            errore: `Lettura del foglio non riuscita: ${f.errore}` }
        : { etichetta: p.etichetta, foglio: f.foglio, stato: "in_attesa", righe: f.righe, lotto: 0, lotti: 0, conteggi: {}, anomalie: f.anomalie };
    }
    const totaleRighe = Object.values(stato.fogli).reduce((s, f) => s + f.righe, 0);
    const scriviStato = async () => {
        const fs = Object.values(stato.fogli);
        const somma = (k: string) => fs.reduce((s, f) => s + (f.conteggi[k] ?? 0), 0);
        const { error } = await supabaseAdmin
          .from("importazioni")
          .update({
            righe_totali: totaleRighe,
            righe_attese: totaleRighe,
            righe_elaborate: Object.entries(stato.fogli).reduce((s, [k, f]) => s + (f.stato === "completato" ? f.righe : Math.min(f.righe, f.lotto * (preparati.get(k)?.lotto ?? 500))), 0),
            righe_create: somma("inseriti"),
            righe_aggiornate: somma("aggiornati"),
            righe_errore: fs.reduce((s, f) => s + f.anomalie, 0),
            report_saltati: { [CHIAVE_STATO_LISTINI]: stato },
          } as never)
          .eq("id", importazioneId);
        if (error) throw new Error(`stato import: ${error.message}`);
    };
    const scrivi = (id: string) => step.run(id, scriviStato);

    await scrivi("stato-iniziale");

    for (const p of PREPARATORI_LISTINI_GAMMA) {
      const f = preparati.get(p.chiave);
      const sf = stato.fogli[p.chiave];
      if (!f || !sf || sf.stato === "errore") continue;
      const g = GESTORI_LISTINI_GAMMA.find((x) => x.chiave === p.chiave);
      sf.stato = "in_corso";
      try {
        if (!g) throw new Error("foglio senza esecutore sul server");
        const conteggi = await g.esegui({
          step: step as unknown as StepApi,
          importazioneId,
          lotti: f.lotti,
          leggiLotto: <T,>(i: number) => leggi<T[]>(fileLottoListini(p.chiave, i), `${p.chiave} lotto ${i + 1}`),
          leggiAnomalie: <T,>() => leggi<T[]>(fileExtraListini(p.chiave, "anomalie"), `${p.chiave} anomalie`),
          leggiCodici: <T,>() => leggi<T[]>(fileExtraListini(p.chiave, "codici"), `${p.chiave} codici`),
          leggiMeta: () => leggi<Record<string, unknown>>(fileExtraListini(p.chiave, "meta"), `${p.chiave} meta`),
          avanzamento: async (lotto, lotti, c) => {
            sf.lotto = lotto;
            sf.lotti = lotti;
            sf.conteggi = c;
            // Dentro lo step del lotto: nessuno step "stato-…" per lotto. Mai bloccante.
            await scriviStato().catch((e) => logger.warn(`avanzamento ${p.chiave}: ${e instanceof Error ? e.message : String(e)}`));
          },
        });
        sf.conteggi = conteggi;
        sf.stato = "completato";
      } catch (e) {
        sf.stato = "errore";
        sf.errore = e instanceof Error ? e.message : String(e);
        logger.error(`foglio ${p.chiave} fallito: ${sf.errore}`);
      }
      await scrivi(`stato-${p.chiave}-fine`);
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
