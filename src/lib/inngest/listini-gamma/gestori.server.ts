import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  FornitoreGammaRow,
  AnomaliaFornitoreFile,
  ArticoloGammaRow,
  AnomaliaArticoloFile,
} from "@/lib/listini-gamma-parser";

/** Solo i metodi dell'API step usati dai gestori (step.run memoizzato). */
export type StepApi = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

export type ContestoGestore = {
  step: StepApi;
  importazioneId: string;
  /** Numero di pacchetti già caricati dal browser in _staging/<importazioneId>/. */
  lotti: number;
  leggiLotto: <T>(i: number) => Promise<T[]>;
  leggiAnomalie: <T>() => Promise<T[]>;
  leggiCodici: <T>() => Promise<T[]>;
  leggiMeta: () => Promise<Record<string, unknown>>;
  /** Salva l'avanzamento del foglio (in uno step con id stabile). */
  avanzamento: (lotto: number, lotti: number, conteggi: Record<string, number>) => Promise<void>;
};

/**
 * Esecutore di un foglio del file MADE_ARTICOLI_LISTINI_PQ.xlsx: lavora solo sui JSON di
 * staging preparati dal browser (lettura in listini-gamma-parser, PREPARATORI_LISTINI_GAMMA,
 * stessa chiave). Il server non apre mai lo xlsx di questo import.
 */
export type GestoreFoglio = {
  chiave: string;
  /** Step del foglio (id con prefisso = chiave). Ritorna i conteggi finali. */
  esegui: (ctx: ContestoGestore) => Promise<Record<string, number>>;
};

/** Anomalie del foglio: delete+insert delle sole anomalie con quel prefisso per questo import (retry-safe). */
async function scriviAnomalie(importazioneId: string, prefisso: string, righe: Record<string, unknown>[]) {
  const { error: delErr } = await supabaseAdmin
    .from("anomalie_import" as never)
    .delete()
    .eq("importazione_id", importazioneId as never)
    .like("tipo_anomalia", `${prefisso}%` as never);
  if (delErr) throw new Error(`anomalie ${prefisso} (pulizia): ${delErr.message}`);
  for (let i = 0; i < righe.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("anomalie_import" as never)
      .insert(righe.slice(i, i + 500).map((r) => ({ importazione_id: importazioneId, ...r })) as never);
    if (error) throw new Error(`anomalie ${prefisso}: ${error.message}`);
  }
}

/* ---------------------------------------------------------------- FORNITORI */

const gestoreFornitori: GestoreFoglio = {
  chiave: "fornitori",
  esegui: async ({ step, importazioneId, lotti, leggiLotto, leggiAnomalie, leggiCodici, avanzamento }) => {
    await step.run("fornitori-anomalie", async () => {
      const anomalie = await leggiAnomalie<AnomaliaFornitoreFile>();
      await scriviAnomalie(
        importazioneId,
        "fornitore_",
        anomalie.map((a) => ({
          codice_gestionale: a.codice,
          ragione_sociale: a.ragione_sociale,
          tipo_anomalia: a.tipo === "codice_mancante" ? "fornitore_codice_mancante" : "fornitore_codice_duplicato",
          campo: "codice_fornitore",
          valore_attuale: `riga ${a.riga}`,
          valore_nuovo:
            a.tipo === "codice_mancante"
              ? "Riga scartata: codice fornitore mancante o non numerico"
              : "Codice ripetuto nel file: tenuta l'ultima riga",
        })),
      );
    });

    let inseriti = 0;
    let aggiornati = 0;
    for (let li = 0; li < lotti; li++) {
      const r = await step.run(`fornitori-lotto-${String(li).padStart(3, "0")}`, async () => {
        const slice = await leggiLotto<Omit<FornitoreGammaRow, "riga">>(li);
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
      const codici = await leggiCodici<number>();
      if (!codici.length) return 0; // foglio vuoto: mai disattivare tutto
      const { data, error } = await supabaseAdmin.rpc("disattiva_fornitori_gamma_assenti", { _codici: codici });
      if (error) throw new Error(`disattiva assenti: ${error.message}`);
      return (data as number | null) ?? 0;
    });

    const coll = await step.run("fornitori-collegamenti", async () => {
      const { data, error } = await supabaseAdmin.rpc("ricalcola_collegamenti_fornitori_clienti");
      if (error) throw new Error(`collegamenti: ${error.message}`);
      const d = (data ?? {}) as { collegamenti_gamma?: number; collegamenti_piva_cf?: number };
      return { gamma: d.collegamenti_gamma ?? 0, pivaCf: d.collegamenti_piva_cf ?? 0 };
    });

    return { inseriti, aggiornati, disattivati, collegamenti_gamma: coll.gamma, collegamenti_piva_cf: coll.pivaCf };
  },
};

/* ----------------------------------------------------------------- ARTICOLI */

const gestoreArticoli: GestoreFoglio = {
  chiave: "articoli",
  esegui: async ({ step, importazioneId, lotti, leggiMeta, leggiLotto, leggiAnomalie, leggiCodici, avanzamento }) => {
    await step.run("articoli-anomalie", async () => {
      const anomalie = await leggiAnomalie<AnomaliaArticoloFile>();
      await scriviAnomalie(
        importazioneId,
        "articolo_",
        anomalie.map((a) => ({
          codice_gestionale: a.codice,
          ragione_sociale: a.descrizione,
          tipo_anomalia: a.tipo === "codice_mancante" ? "articolo_codice_mancante" : "articolo_codice_duplicato",
          campo: "codice_articolo",
          valore_attuale: `riga ${a.riga}`,
          valore_nuovo:
            a.tipo === "codice_mancante"
              ? "Riga scartata: codice articolo mancante"
              : "Codice ripetuto nel file: tenuta l'ultima riga",
        })),
      );
    });

    const marche = await step.run("articoli-marche", async () => {
      const meta = await leggiMeta();
      const elenco = (meta.marche ?? []) as Array<{ codice: string; descrizione: string | null }>;
      if (!elenco.length) return 0;
      const { data, error } = await supabaseAdmin.rpc("import_marche_gamma", { _righe: elenco as never });
      if (error) throw new Error(`marche: ${error.message}`);
      return (data as number | null) ?? 0;
    });

    let inseriti = 0;
    let aggiornati = 0;
    let listini = 0;
    for (let li = 0; li < lotti; li++) {
      const r = await step.run(`articoli-lotto-${String(li).padStart(3, "0")}`, async () => {
        const slice = await leggiLotto<Omit<ArticoloGammaRow, "riga">>(li);
        const { data, error } = await supabaseAdmin.rpc("import_articoli_gamma_lotto", { _righe: slice as never });
        if (error) throw new Error(`articoli lotto ${li + 1}/${lotti}: ${error.message}`);
        const e = (data ?? {}) as { inseriti?: number; aggiornati?: number; listini?: number };
        return { inseriti: e.inseriti ?? 0, aggiornati: e.aggiornati ?? 0, listini: e.listini ?? 0 };
      });
      inseriti += r.inseriti;
      aggiornati += r.aggiornati;
      listini += r.listini;
      await avanzamento(li + 1, lotti, { marche, inseriti, aggiornati, righe_listino: listini });
    }

    const disattivati = await step.run("articoli-disattiva-assenti", async () => {
      const codici = await leggiCodici<string>();
      if (!codici.length) return 0; // foglio vuoto: mai disattivare tutto
      const { data, error } = await supabaseAdmin.rpc("disattiva_articoli_gamma_assenti", { _codici: codici });
      if (error) throw new Error(`disattiva articoli assenti: ${error.message}`);
      return (data as number | null) ?? 0;
    });

    return { marche, inseriti, aggiornati, disattivati, righe_listino: listini };
  },
};

/** Esecutori per chiave; l'ordine fisso è quello di PREPARATORI_LISTINI_GAMMA. */
export const GESTORI_LISTINI_GAMMA: GestoreFoglio[] = [gestoreFornitori, gestoreArticoli];
