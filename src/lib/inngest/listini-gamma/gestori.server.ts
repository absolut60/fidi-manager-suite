import type * as XLSX from "xlsx";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadJsonConRetry } from "../functions.server";
import {
  trovaFoglioFornitori,
  parseFornitoriGammaSheet,
  type FornitoreGammaRow,
} from "../parsers.server";

/** Solo i metodi dell'API step usati dai gestori (step.run memoizzato). */
export type StepApi = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

export type ContestoGestore = {
  step: StepApi;
  importazioneId: string;
  stagingPath: string;
  meta: Record<string, unknown>;
  log: (m: string) => void;
  /** Salva l'avanzamento del foglio (in uno step con id stabile). */
  avanzamento: (lotto: number, lotti: number, conteggi: Record<string, number>) => Promise<void>;
};

/**
 * Gestore di un foglio del file MADE_ARTICOLI_LISTINI_PQ.xlsx.
 * Aggiungere un foglio = aggiungere un gestore a GESTORI_LISTINI_GAMMA.
 */
export type GestoreFoglio = {
  chiave: string;
  etichetta: string;
  trovaFoglio: (wb: XLSX.WorkBook) => { nome: string; sheet: XLSX.WorkSheet } | null;
  /** Eseguito una sola volta nello step "parse": righe da mettere in staging + meta piccoli. */
  prepara: (sheet: XLSX.WorkSheet) => { righe: unknown[]; righeLette: number; anomalie: number; meta: Record<string, unknown> };
  /** Step del foglio (id con prefisso = chiave). Ritorna i conteggi finali. */
  esegui: (ctx: ContestoGestore) => Promise<Record<string, number>>;
};

/* ---------------------------------------------------------------- FORNITORI */

const FORNITORI_LOTTO = 500;

type AnomaliaFile = { riga: number; tipo: "codice_mancante" | "codice_duplicato"; codice: string | null; ragione_sociale: string | null };

const gestoreFornitori: GestoreFoglio = {
  chiave: "fornitori",
  etichetta: "Fornitori",
  trovaFoglio: trovaFoglioFornitori,
  prepara: (sheet) => {
    const r = parseFornitoriGammaSheet(sheet);
    return { righe: r.rows, righeLette: r.righeLette, anomalie: r.anomalie.length, meta: { anomalie: r.anomalie } };
  },
  esegui: async ({ step, importazioneId, stagingPath, meta, log, avanzamento }) => {
    const anomalie = (meta.anomalie ?? []) as AnomaliaFile[];

    // Anomalie del foglio: delete+insert delle sole anomalie fornitore di questo import.
    await step.run("fornitori-anomalie", async () => {
      await supabaseAdmin
        .from("anomalie_import" as never)
        .delete()
        .eq("importazione_id", importazioneId as never)
        .like("tipo_anomalia", "fornitore_%" as never);
      if (!anomalie.length) return;
      const righe = anomalie.map((a) => ({
        importazione_id: importazioneId,
        codice_gestionale: a.codice,
        ragione_sociale: a.ragione_sociale,
        tipo_anomalia: a.tipo === "codice_mancante" ? "fornitore_codice_mancante" : "fornitore_codice_duplicato",
        campo: "codice_fornitore",
        valore_attuale: `riga ${a.riga}`,
        valore_nuovo:
          a.tipo === "codice_mancante"
            ? "Riga scartata: codice fornitore mancante o non numerico"
            : "Codice ripetuto nel file: tenuta l'ultima riga",
      }));
      const { error } = await supabaseAdmin.from("anomalie_import" as never).insert(righe as never);
      if (error) throw new Error(`anomalie fornitori: ${error.message}`);
    });

    const totale = Number(meta.__righe ?? 0);
    const lotti = Math.ceil(totale / FORNITORI_LOTTO);
    let inseriti = 0;
    let aggiornati = 0;
    for (let li = 0; li < lotti; li++) {
      const r = await step.run(`fornitori-lotto-${String(li).padStart(3, "0")}`, async () => {
        const tutte = await downloadJsonConRetry<FornitoreGammaRow[]>(stagingPath, `fornitori lotto ${li + 1}`, log);
        const slice = tutte
          .slice(li * FORNITORI_LOTTO, (li + 1) * FORNITORI_LOTTO)
          .map(({ riga: _riga, ...resto }) => resto);
        const { data, error } = await supabaseAdmin.rpc("import_fornitori_gamma_lotto", { _righe: slice as never });
        if (error) throw new Error(`fornitori lotto ${li + 1}/${lotti}: ${error.message}`);
        const e = (data ?? {}) as { inseriti?: number; aggiornati?: number };
        return { inseriti: e.inseriti ?? 0, aggiornati: e.aggiornati ?? 0 };
      });
      inseriti += r.inseriti;
      aggiornati += r.aggiornati;
      await avanzamento(li + 1, lotti, { inseriti, aggiornati });
    }

    const disattivati = await step.run("fornitori-disattiva-assenti", async () => {
      const tutte = await downloadJsonConRetry<FornitoreGammaRow[]>(stagingPath, "fornitori assenti", log);
      if (!tutte.length) return 0; // foglio vuoto: mai disattivare tutto
      const { data, error } = await supabaseAdmin.rpc("disattiva_fornitori_gamma_assenti", {
        _codici: tutte.map((r) => r.codice_gestionale),
      });
      if (error) throw new Error(`disattiva assenti: ${error.message}`);
      return (data as number | null) ?? 0;
    });

    const coll = await step.run("fornitori-collegamenti", async () => {
      const { data, error } = await supabaseAdmin.rpc("ricalcola_collegamenti_fornitori_clienti");
      if (error) throw new Error(`collegamenti: ${error.message}`);
      const d = (data ?? {}) as { collegamenti_gamma?: number; collegamenti_piva_cf?: number };
      return { gamma: d.collegamenti_gamma ?? 0, pivaCf: d.collegamenti_piva_cf ?? 0 };
    });

    return {
      inseriti,
      aggiornati,
      disattivati,
      collegamenti_gamma: coll.gamma,
      collegamenti_piva_cf: coll.pivaCf,
    };
  },
};

/** Ordine fisso di esecuzione. Prossime fette: articoli, articoli-fornitori, listini, giacenze… */
export const GESTORI_LISTINI_GAMMA: GestoreFoglio[] = [gestoreFornitori];
