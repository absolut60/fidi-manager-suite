import * as XLSX from "xlsx";
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalize, toStr } from "./parsers.server";
import { formattaNomeProprio, formattaRagioneSociale } from "@/lib/formato-nomi";

type EventiImportEventData = {
  importazioneId: string;
  eventoId: string;
  filePath: string;
  userId?: string;
};

/** Timeout su ogni chiamata async: senza throw Inngest non ritenta (pattern di progetto). */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Intestazioni accettate nel modello (normalizzate). */
const COLONNE: Record<string, string[]> = {
  nome: ["nome"],
  cognome: ["cognome"],
  ragione_sociale: ["ragione sociale", "ragione sociale azienda", "azienda"],
  partita_iva: ["partita iva", "p iva", "piva"],
  codice_fiscale: ["codice fiscale", "cf"],
  email: ["email", "e mail", "mail"],
  telefono: ["telefono", "tel"],
  cellulare: ["cellulare", "cell"],
  note: ["note", "nota"],
};

type RigaGrezza = {
  riga: number;
  nome: string | null;
  cognome: string | null;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  telefono: string | null;
  cellulare: string | null;
  note: string | null;
};

type Candidato = {
  tipo: string;
  id: string | null;
  contatto_id: string | null;
  etichetta: string | null;
  criterio: string | null;
  privacy_firmata: boolean | null;
  priorita: number;
};

function leggiFoglio(wb: XLSX.WorkBook): RigaGrezza[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (!matrix.length) return [];

  const header = (matrix[0] ?? []).map((c) => normalize(String(c ?? "")));
  const mappa: Record<string, number> = {};
  for (const [campo, alias] of Object.entries(COLONNE)) {
    const idx = header.findIndex((h) => alias.includes(h));
    if (idx >= 0) mappa[campo] = idx;
  }

  const righe: RigaGrezza[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const get = (campo: string) =>
      mappa[campo] === undefined ? null : toStr(row[mappa[campo]]);
    const grezza: RigaGrezza = {
      riga: i + 1,
      nome: get("nome"),
      cognome: get("cognome"),
      ragione_sociale: get("ragione_sociale"),
      partita_iva: get("partita_iva"),
      codice_fiscale: get("codice_fiscale"),
      email: get("email"),
      telefono: get("telefono"),
      cellulare: get("cellulare"),
      note: get("note"),
    };
    // Salta le righe completamente vuote
    const qualcosa = Object.entries(grezza).some(([k, v]) => k !== "riga" && v);
    if (!qualcosa) continue;
    righe.push({
      ...grezza,
      // Normalizzazione condivisa con la UI (nessuna regola duplicata)
      nome: grezza.nome ? formattaNomeProprio(grezza.nome) : null,
      cognome: grezza.cognome ? formattaNomeProprio(grezza.cognome) : null,
      ragione_sociale: grezza.ragione_sociale
        ? formattaRagioneSociale(grezza.ragione_sociale)
        : null,
      email: grezza.email ? grezza.email.trim().toLowerCase() : null,
    });
  }
  return righe;
}

export const processEventiPartecipantiImport = inngest.createFunction(
  {
    id: "process-eventi-partecipanti-import",
    name: "Process import partecipanti evento",
    retries: 2,
    timeouts: { finish: "10m" },
    triggers: [{ event: "import/eventi_partecipanti.requested" }],
  },
  async ({ event, step, logger }) => {
    const { importazioneId, eventoId, filePath } = event.data as EventiImportEventData;

    try {
      // STEP 1: scarica e parsifica il file
      const righe = await step.run("parse-file", async () => {
        const { data: file, error } = await withTimeout(
          supabaseAdmin.storage.from("import-files").download(filePath),
          60_000,
          "download file",
        );
        if (error || !file) throw new Error(`Download fallito: ${error?.message ?? "no data"}`);
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, cellFormula: false });
        return leggiFoglio(wb);
      });

      await step.run("init-importazione", async () => {
        await withTimeout(
          supabaseAdmin
            .from("importazioni")
            .update({
              righe_totali: righe.length,
              righe_elaborate: 0,
              righe_create: 0,
              righe_aggiornate: 0,
              righe_errore: 0,
              righe_saltate: 0,
              stato: "in_elaborazione",
            })
            .eq("id", importazioneId),
          30_000,
          "init importazione",
        );
      });

      if (!righe.length) {
        await step.run("finalize-empty", async () => {
          await supabaseAdmin
            .from("importazioni")
            .update({
              stato: "completata_con_errori",
              completata_at: new Date().toISOString(),
              log_errori: [{ riga: 0, errore: "Nessuna riga da processare" }] as never,
            })
            .eq("id", importazioneId);
        });
        return { righe: 0 };
      }

      // STEP 2: riconoscimento + staging (file piccoli: passaggio unico)
      const esito = await step.run("riconosci-e-staging", async () => {
        let create = 0;
        let scartate = 0;
        const errori: Array<{ riga: number; errore: string }> = [];

        for (const r of righe) {
          const haIdentificativo =
            !!r.email || !!r.ragione_sociale || (!!r.nome && !!r.cognome);
          if (!haIdentificativo) {
            scartate++;
            errori.push({ riga: r.riga, errore: "Riga senza identificativo (email, nome+cognome o ragione sociale)" });
            await withTimeout(
              supabaseAdmin.from("anomalie_import").insert({
                importazione_id: importazioneId,
                tipo_anomalia: "riga_senza_identificativo",
                campo: "identificativo",
                ragione_sociale: r.ragione_sociale,
                valore_attuale: `riga ${r.riga}`,
                stato: "aperta",
              } as never),
              20_000,
              `anomalia riga ${r.riga}`,
            );
            continue;
          }

          const { data: matches, error: mErr } = await withTimeout(
            supabaseAdmin.rpc("trova_corrispondenze_soggetto", {
              _email: r.email,
              _partita_iva: r.partita_iva,
              _codice_fiscale: r.codice_fiscale,
              _nome: r.nome,
              _cognome: r.cognome,
              _ragione_sociale: r.ragione_sociale,
            }),
            30_000,
            `match riga ${r.riga}`,
          );
          if (mErr) throw new Error(`trova_corrispondenze_soggetto: ${mErr.message}`);

          const candidati = (matches ?? []) as unknown as Candidato[];
          const primo = candidati[0] ?? null;

          const { error: insErr } = await withTimeout(
            supabaseAdmin.from("eventi_import_righe").insert({
              importazione_id: importazioneId,
              evento_id: eventoId,
              riga_numero: r.riga,
              nome: r.nome,
              cognome: r.cognome,
              ragione_sociale: r.ragione_sociale,
              partita_iva: r.partita_iva,
              codice_fiscale: r.codice_fiscale,
              email: r.email,
              telefono: r.telefono,
              cellulare: r.cellulare,
              note: r.note,
              match_tipo: primo ? primo.tipo : "nessuno",
              match_id: primo?.id ?? null,
              match_contatto_id: primo?.contatto_id ?? null,
              match_criterio: primo?.criterio ?? null,
              match_privacy_firmata: primo?.privacy_firmata ?? null,
              match_alternative: candidati.length > 1 ? (candidati.slice(1) as never) : null,
              stato: "in_sospeso",
            } as never),
            30_000,
            `insert staging riga ${r.riga}`,
          );
          if (insErr) throw new Error(`insert staging riga ${r.riga}: ${insErr.message}`);
          create++;
        }

        const { error: rpcErr } = await withTimeout(
          (
            supabaseAdmin.rpc as unknown as (
              fn: string,
              args: Record<string, unknown>,
            ) => PromiseLike<{ error: { message: string } | null }>
          )("increment_importazione_counters", {
            _importazione_id: importazioneId,
            _righe_elaborate: righe.length,
            _righe_create: create,
            _righe_aggiornate: 0,
            _righe_errore: 0,
            _righe_saltate: scartate,
          }),
          30_000,
          "increment_importazione_counters",
        );
        if (rpcErr) throw new Error(`increment_importazione_counters: ${rpcErr.message}`);

        return { create, scartate, errori };
      });

      await step.run("finalize", async () => {
        await supabaseAdmin
          .from("importazioni")
          .update({
            stato: esito.scartate > 0 ? "completata_con_errori" : "completata",
            completata_at: new Date().toISOString(),
            log_errori: (esito.errori.length ? esito.errori : []) as never,
          })
          .eq("id", importazioneId);
      });

      logger.info(
        `Import partecipanti evento ${eventoId}: ${esito.create} in sospeso, ${esito.scartate} scartate`,
      );
      return { righe: righe.length, inSospeso: esito.create, scartate: esito.scartate };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("importazioni")
        .update({
          stato: "completata_con_errori",
          completata_at: new Date().toISOString(),
          log_errori: [{ riga: 0, errore: `Errore fatale: ${message}` }] as never,
        })
        .eq("id", importazioneId);
      throw e;
    }
  },
);
