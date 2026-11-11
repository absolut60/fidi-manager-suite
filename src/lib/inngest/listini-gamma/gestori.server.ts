import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  FornitoreGammaRow,
  AnomaliaFornitoreFile,
  ArticoloGammaRow,
  AnomaliaArticoloFile,
  AnomaliaChiaveFile,
  DepositoGammaRow,
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
  /**
   * Scrive l'avanzamento del foglio. Va chiamata DENTRO lo step del lotto (nessuno step
   * dedicato): non lancia mai, un avanzamento non scritto non fa ripetere il lotto.
   */
  avanzamento: (lotto: number, lotti: number, conteggi: Record<string, number>) => Promise<void>;
};

/** Lotti dello stesso foglio eseguiti in parallelo (sono indipendenti); i fogli restano in sequenza. */
export const LOTTI_PARALLELI = 3;

/**
 * Esegue i lotti di un foglio a gruppi di LOTTI_PARALLELI step (Promise.all di step.run).
 * Ogni step scrive l'avanzamento con i totali dei gruppi precedenti più il proprio lotto.
 * Gli id degli step restano `<prefisso>-lotto-NNN`.
 */
async function eseguiLotti(
  ctx: ContestoGestore,
  prefisso: string,
  iniziali: Record<string, number>,
  lavora: (li: number) => Promise<Record<string, number>>,
): Promise<Record<string, number>> {
  const tot: Record<string, number> = { ...iniziali };
  const somma = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  for (let g = 0; g < ctx.lotti; g += LOTTI_PARALLELI) {
    const base = { ...tot };
    const ids = Array.from({ length: Math.min(LOTTI_PARALLELI, ctx.lotti - g) }, (_, i) => g + i);
    const ris = await Promise.all(
      ids.map((li) =>
        ctx.step.run(`${prefisso}-lotto-${String(li).padStart(3, "0")}`, async () => {
          const r = await lavora(li);
          await ctx.avanzamento(li + 1, ctx.lotti, somma(base, r));
          return r;
        }),
      ),
    );
    for (const r of ris) Object.assign(tot, somma(tot, r));
  }
  return tot;
}

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
  esegui: async (ctx) => {
    const { step, importazioneId, lotti, leggiLotto, leggiAnomalie, leggiCodici } = ctx;
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

    const { inseriti, aggiornati, invariati } = await eseguiLotti(ctx, "fornitori", { inseriti: 0, aggiornati: 0, invariati: 0 }, async (li) => {
      const slice = await leggiLotto<Omit<FornitoreGammaRow, "riga">>(li);
      const { data, error } = await supabaseAdmin.rpc("import_fornitori_gamma_lotto", { _righe: slice as never });
      if (error) throw new Error(`fornitori lotto ${li + 1}/${lotti}: ${error.message}`);
      const e = (data ?? {}) as { inseriti?: number; aggiornati?: number; invariati?: number };
      return { inseriti: e.inseriti ?? 0, aggiornati: e.aggiornati ?? 0, invariati: e.invariati ?? 0 };
    });

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

    return { inseriti, aggiornati, invariati, disattivati, collegamenti_gamma: coll.gamma, collegamenti_piva_cf: coll.pivaCf };
  },
};

/* ----------------------------------------------------------------- ARTICOLI */

const gestoreArticoli: GestoreFoglio = {
  chiave: "articoli",
  esegui: async (ctx) => {
    const { step, importazioneId, lotti, leggiMeta, leggiLotto, leggiAnomalie, leggiCodici } = ctx;
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

    const t = await eseguiLotti(ctx, "articoli", { marche, inseriti: 0, aggiornati: 0, invariati: 0, righe_listino: 0, listini_riscritti: 0 }, async (li) => {
      const slice = await leggiLotto<Omit<ArticoloGammaRow, "riga">>(li);
      const { data, error } = await supabaseAdmin.rpc("import_articoli_gamma_lotto", { _righe: slice as never });
      if (error) throw new Error(`articoli lotto ${li + 1}/${lotti}: ${error.message}`);
      const e = (data ?? {}) as Record<string, number | undefined>;
      return { inseriti: e.inseriti ?? 0, aggiornati: e.aggiornati ?? 0, invariati: e.invariati ?? 0, righe_listino: e.listini ?? 0, listini_riscritti: e.listini_riscritti ?? 0 };
    });

    const disattivati = await step.run("articoli-disattiva-assenti", async () => {
      const codici = await leggiCodici<string>();
      if (!codici.length) return 0; // foglio vuoto: mai disattivare tutto
      const { data, error } = await supabaseAdmin.rpc("disattiva_articoli_gamma_assenti", { _codici: codici });
      if (error) throw new Error(`disattiva articoli assenti: ${error.message}`);
      return (data as number | null) ?? 0;
    });

    return { marche, inseriti: t.inseriti, aggiornati: t.aggiornati, invariati: t.invariati, disattivati, righe_listino: t.righe_listino, listini_riscritti: t.listini_riscritti };
  },
};


/* ---------------------------------------------- DEPOSITI / GIACENZE / ART-FORN (fetta 3A) */

const TESTO_ANOMALIA: Record<AnomaliaChiaveFile["tipo"], string> = {
  codice_mancante: "Riga scartata: codice mancante",
  chiave_duplicata: "Chiave ripetuta nel file: tenuta l'ultima riga",
  valore_non_valido: "Riga scartata: valore non valido",
};

function anomalieChiave(prefisso: string, campo: string, a: AnomaliaChiaveFile[]) {
  return a.map((x) => ({
    codice_gestionale: x.codice,
    ragione_sociale: x.dettaglio,
    tipo_anomalia: `${prefisso}${x.tipo}`,
    campo,
    valore_attuale: `riga ${x.riga}`,
    valore_nuovo: TESTO_ANOMALIA[x.tipo],
  }));
}

const gestoreDepositi: GestoreFoglio = {
  chiave: "depositi",
  esegui: async ({ step, importazioneId, lotti, leggiLotto, leggiAnomalie, leggiCodici }) => {
    // Un solo step: anomalie + upsert (89 righe, retry-safe).
    const r = await step.run("depositi-import", async () => {
      await scriviAnomalie(importazioneId, "deposito_", anomalieChiave("deposito_", "deposito", await leggiAnomalie<AnomaliaChiaveFile>()));
      const righe: Omit<DepositoGammaRow, "riga">[] = [];
      for (let i = 0; i < lotti; i++) righe.push(...(await leggiLotto<Omit<DepositoGammaRow, "riga">>(i)));
      if (!righe.length) return { inseriti: 0, aggiornati: 0, sede_senza_negozio: 0 };
      const { data, error } = await supabaseAdmin.rpc("import_depositi_gamma", { _righe: righe as never });
      if (error) throw new Error(`depositi: ${error.message}`);
      const d = (data ?? {}) as Record<string, number>;
      return { inseriti: d.inseriti ?? 0, aggiornati: d.aggiornati ?? 0, sede_senza_negozio: d.sede_senza_negozio ?? 0 };
    });
    // Assenti dal file → attivo=false (mai cancellati), come fornitori e articoli.
    const disattivati = await step.run("depositi-disattiva-assenti", async () => {
      const codici = await leggiCodici<string>();
      if (!codici.length) return 0; // foglio vuoto: mai disattivare tutto
      const { data, error } = await supabaseAdmin.rpc("disattiva_depositi_gamma_assenti", { _codici: codici });
      if (error) throw new Error(`disattiva depositi assenti: ${error.message}`);
      return (data as number | null) ?? 0;
    });
    return { ...r, disattivati };
  },
};

/**
 * Foglio "fotografia" a lotti: upsert con importazione_id, poi chiusura che cancella le righe
 * di import precedenti. La chiusura parte SOLO se c'era almeno una riga e tutti i lotti sono
 * riusciti (un lotto fallito lancia l'errore e il foglio si ferma prima della chiusura).
 */
function gestoreFotografia(o: {
  chiave: string; prefisso: string; campo: string; rpcLotto: string; rpcChiudi: string;
  anomaliaScarto?: (s: Record<string, unknown>) => Record<string, unknown>;
  extra: string[];
}): GestoreFoglio {
  return {
    chiave: o.chiave,
    esegui: async (ctx) => {
      const { step, importazioneId, lotti, leggiLotto, leggiAnomalie } = ctx;
      await step.run(`${o.chiave}-anomalie`, async () => {
        await scriviAnomalie(importazioneId, o.prefisso, anomalieChiave(o.prefisso, o.campo, await leggiAnomalie<AnomaliaChiaveFile>()));
      });
      const iniziali: Record<string, number> = { inseriti: 0, aggiornati: 0, invariati: 0, ...Object.fromEntries(o.extra.map((k) => [k, 0])) };
      const tot = await eseguiLotti(ctx, o.chiave, iniziali, async (li) => {
        const slice = await leggiLotto<Record<string, unknown>>(li);
        const { data, error } = await supabaseAdmin.rpc(o.rpcLotto as never, { _righe: slice, _importazione: importazioneId } as never);
        if (error) throw new Error(`${o.chiave} lotto ${li + 1}/${lotti}: ${error.message}`);
        const d = (data ?? {}) as Record<string, unknown>;
        const scarti = Array.isArray(d.deposito_inesistente) ? (d.deposito_inesistente as Record<string, unknown>[]) : [];
        if (o.anomaliaScarto) {
          // Anomalie del lotto: prefisso dedicato per lotto, così il retry le riscrive senza doppioni.
          const pref = `${o.prefisso}deposito_inesistente_l${String(li).padStart(3, "0")}`;
          await scriviAnomalie(importazioneId, pref, scarti.map(o.anomaliaScarto).map((a) => ({ ...a, tipo_anomalia: pref })));
        }
        const out: Record<string, number> = { inseriti: Number(d.inseriti ?? 0), aggiornati: Number(d.aggiornati ?? 0), invariati: Number(d.invariati ?? 0) };
        for (const k of o.extra) out[k] = k === "deposito_inesistente" ? scarti.length : Number(d[k] ?? 0);
        return out;
      });
      const rimossi = await step.run(`${o.chiave}-chiudi`, async () => {
        if (!lotti || tot.inseriti + tot.aggiornati + tot.invariati === 0) return 0; // nessuna riga valida: non cancellare nulla
        const { data, error } = await supabaseAdmin.rpc(o.rpcChiudi as never, { _importazione: importazioneId } as never);
        if (error) throw new Error(`${o.chiave} chiusura: ${error.message}`);
        return (data as number | null) ?? 0;
      });
      return { ...tot, rimossi };
    },
  };
}

const gestoreGiacenze = gestoreFotografia({
  chiave: "giacenze",
  prefisso: "giacenza_",
  campo: "deposito",
  rpcLotto: "import_giacenze_gamma_lotto",
  rpcChiudi: "chiudi_giacenze_gamma",
  extra: ["non_in_catalogo", "deposito_inesistente"],
  anomaliaScarto: (s) => ({
    codice_gestionale: s.articolo_codice,
    ragione_sociale: `Deposito ${String(s.deposito_codice)}`,
    campo: "deposito",
    valore_attuale: String(s.deposito_codice),
    valore_nuovo: "Riga scartata: deposito non presente nell'elenco depositi",
  }),
});

const gestoreArticoliFornitori = gestoreFotografia({
  chiave: "articoli_fornitori",
  prefisso: "articolo_fornitore_",
  campo: "codice_fornitore",
  rpcLotto: "import_articoli_fornitori_gamma_lotto",
  rpcChiudi: "chiudi_articoli_fornitori_gamma",
  extra: ["non_in_catalogo", "fornitore_sconosciuto"],
});

/** Esecutori per chiave; l'ordine fisso è quello di PREPARATORI_LISTINI_GAMMA. */
export const GESTORI_LISTINI_GAMMA: GestoreFoglio[] = [
  gestoreFornitori,
  gestoreArticoli,
  gestoreDepositi,
  gestoreGiacenze,
  gestoreArticoliFornitori,
];
