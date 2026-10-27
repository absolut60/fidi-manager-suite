import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Fonte unica per la pulizia dei file TEMPORANEI degli import nel bucket "import-files".
 * Tocca SOLO i prefissi "_staging/{id}/" e "blocco-fido/{id}/".
 * I file originali caricati dagli utenti ("{id}/nome.xlsx") non vengono mai toccati.
 * Mai bloccante: gli errori finiscono solo nei log.
 * Regola documentata in docs/regole/fonti-uniche.md (parte import).
 */

const BUCKET = "import-files";
const PREFISSI_TEMPORANEI = ["_staging", "blocco-fido"] as const;
const BLOCCO_RIMOZIONE = 1000;
/** Tetto di file rimossi per giro nella pulizia dell'arretrato. */
export const TETTO_ARRETRATO_PER_GIRO = 5000;
const ORE_ARRETRATO = 24;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EsitoPulizia = { file: number; byte: number };

function log(msg: string) {
  console.warn(`[pulizia-file-import] ${msg}`);
}

/** Rimuove i file di un singolo import nei due prefissi temporanei (fino a `tetto`). */
async function pulisciImport(importazioneId: string, tetto: number): Promise<EsitoPulizia> {
  const esito: EsitoPulizia = { file: 0, byte: 0 };
  if (!UUID_RE.test(importazioneId)) return esito;
  for (const pref of PREFISSI_TEMPORANEI) {
    const dir = `${pref}/${importazioneId}`;
    // Ogni giro rilista: i file rimossi spariscono dall'elenco.
    while (esito.file < tetto) {
      const limite = Math.min(BLOCCO_RIMOZIONE, tetto - esito.file);
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { limit: limite });
      if (error) {
        log(`list ${dir}: ${error.message}`);
        break;
      }
      // Solo file (le "cartelle" hanno id null).
      const files = (data ?? []).filter((f) => f.id);
      if (!files.length) break;
      const percorsi = files.map((f) => `${dir}/${f.name}`);
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(percorsi);
      if (rmErr) {
        log(`remove ${dir}: ${rmErr.message}`);
        break;
      }
      esito.file += percorsi.length;
      for (const f of files) {
        const size = (f.metadata as { size?: number } | null)?.size;
        esito.byte += typeof size === "number" ? size : 0;
      }
      if (files.length < limite) break;
    }
  }
  return esito;
}

/** Pulizia a fine import: da chiamare SOLO dopo la chiusura finale riuscita. */
export async function pulisciFileTemporaneiImport(importazioneId: string): Promise<EsitoPulizia> {
  try {
    return await pulisciImport(importazioneId, Number.MAX_SAFE_INTEGER);
  } catch (e) {
    log(`import ${importazioneId}: ${e instanceof Error ? e.message : String(e)}`);
    return { file: 0, byte: 0 };
  }
}

/**
 * Arretrato: importazioni con completata_at più vecchio di 24 ore che hanno ancora
 * file nei due prefissi. A blocchi di max 1000, con tetto per giro.
 */
export async function pulisciArretratoFileImport(
  tetto: number = TETTO_ARRETRATO_PER_GIRO,
): Promise<EsitoPulizia> {
  const tot: EsitoPulizia = { file: 0, byte: 0 };
  try {
    const ids = new Set<string>();
    for (const pref of PREFISSI_TEMPORANEI) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(pref, { limit: 1000 });
      if (error) {
        log(`list ${pref}: ${error.message}`);
        continue;
      }
      for (const d of data ?? []) if (!d.id && UUID_RE.test(d.name)) ids.add(d.name);
    }
    if (!ids.size) return tot;
    const soglia = new Date(Date.now() - ORE_ARRETRATO * 3600_000).toISOString();
    const elenco = [...ids];
    const chiusi: string[] = [];
    for (let i = 0; i < elenco.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from("importazioni")
        .select("id")
        .in("id", elenco.slice(i, i + 200))
        .not("completata_at", "is", null)
        .lt("completata_at", soglia)
        .in("stato", ["completata", "completata_con_errori", "fallita"]);
      if (error) {
        log(`lettura importazioni: ${error.message}`);
        continue;
      }
      for (const r of data ?? []) chiusi.push(r.id as string);
    }
    for (const id of chiusi) {
      if (tot.file >= tetto) break;
      const e = await pulisciImport(id, tetto - tot.file);
      tot.file += e.file;
      tot.byte += e.byte;
    }
  } catch (e) {
    log(`arretrato: ${e instanceof Error ? e.message : String(e)}`);
  }
  return tot;
}
