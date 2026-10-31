/**
 * FONTE UNICA della regola "tutti gli import del giro sono arrivati" che fa
 * partire da solo il ricalcolo del fido teorico.
 *
 * Regola: per CIASCUNA delle quattro fonti esiste un'importazione con stato
 * `completata` o `completata_con_errori` creata OGGI (Europe/Rome), almeno
 * una di queste importazioni è successiva all'ultimo ricalcolo
 * (`configurazioni.fido_teorico_ultimo_ricalcolo`), e nessuna importazione
 * di quelle fonti è ancora `in_elaborazione`. Ordine libero.
 *
 * Usata sia dal job Inngest `verifica-import-completi-fido-teorico` (client
 * admin) sia dalla card/avviso in Import/Export (client utente): la query e la
 * valutazione stanno solo qui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FONTI_IMPORT_FIDO_TEORICO = [
  "anagrafica",
  "analisi_rischio",
  "scadenziario",
  "blocco_fido_assicurazione",
] as const;
export type FonteImportFidoTeorico = (typeof FONTI_IMPORT_FIDO_TEORICO)[number];

export const ETICHETTE_FONTI_FIDO_TEORICO: Record<FonteImportFidoTeorico, string> = {
  anagrafica: "Anagrafica clienti",
  analisi_rischio: "Analisi rischio",
  scadenziario: "Scadenziario",
  blocco_fido_assicurazione: "Blocco fido e assicurazione",
};

const STATI_CONCLUSI = ["completata", "completata_con_errori"];

export type RigaImportFido = { fonte: string | null; stato: string; created_at: string };

export type StatoImportCompleti = {
  pronto: boolean;
  mancanti: FonteImportFidoTeorico[];
  inElaborazione: FonteImportFidoTeorico[];
};

/** Interpreta anche il formato testo di Postgres ("2026-10-30 17:03:43.08+00"). */
export function istanteDa(valore: string | null | undefined): number | null {
  if (!valore) return null;
  let s = valore.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

function giornoRoma(istante: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(istante));
}

/** Mezzanotte locale, con l'offset di Roma a inizio giornata (anche nei cambi DST). */
function inizioGiornoRoma(ora: Date): string {
  const mezzanotteUtc = new Date(`${giornoRoma(ora.getTime())}T00:00:00Z`);
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(mezzanotteUtc);
  const oreOffset = Number(parti.find((p) => p.type === "hour")?.value);
  return new Date(mezzanotteUtc.getTime() - oreOffset * 3_600_000).toISOString();
}

export function valutaImportCompleti(
  ultimoRicalcolo: string | null,
  righe: RigaImportFido[],
  ora: Date = new Date(),
): StatoImportCompleti {
  const soglia = istanteDa(ultimoRicalcolo);
  const oggi = giornoRoma(ora.getTime());
  let qualcosaDiNuovo = false;
  const mancanti: FonteImportFidoTeorico[] = [];
  const inElaborazione: FonteImportFidoTeorico[] = [];
  for (const fonte of FONTI_IMPORT_FIDO_TEORICO) {
    const dellaFonte = righe.filter((r) => r.fonte === fonte);
    if (dellaFonte.some((r) => r.stato === "in_elaborazione")) inElaborazione.push(fonte);
    const arrivato = dellaFonte.some((r) => {
      if (!STATI_CONCLUSI.includes(r.stato)) return false;
      const t = istanteDa(r.created_at);
      if (t === null || giornoRoma(t) !== oggi) return false;
      return true;
    });
    if (!arrivato) mancanti.push(fonte);
    if (dellaFonte.some((r) => {
      const t = istanteDa(r.created_at);
      return STATI_CONCLUSI.includes(r.stato) && t !== null &&
        giornoRoma(t) === oggi && (soglia === null || t > soglia);
    })) qualcosaDiNuovo = true;
  }
  return { pronto: mancanti.length === 0 && inElaborazione.length === 0 && qualcosaDiNuovo, mancanti, inElaborazione };
}

/** Legge configurazione e importazioni e applica la regola. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leggiStatoImportCompleti(client: SupabaseClient<any>, ora: Date = new Date()): Promise<
  StatoImportCompleti & { ultimoRicalcolo: string | null }
> {
  const cfg = await client
    .from("configurazioni")
    .select("valore")
    .eq("chiave", "fido_teorico_ultimo_ricalcolo")
    .maybeSingle();
  if (cfg.error) throw new Error(cfg.error.message);
  const ultimoRicalcolo = (cfg.data?.valore as string | undefined) ?? null;

  const q = client
    .from("importazioni")
    .select("fonte, stato, created_at")
    .in("fonte", [...FONTI_IMPORT_FIDO_TEORICO])
    // Mantiene tutti gli import di oggi, anche precedenti al ricalcolo,
    // e gli import ancora in elaborazione anche se creati nei giorni scorsi.
    .or(`stato.eq.in_elaborazione,created_at.gte.${inizioGiornoRoma(ora)}`);
  const imp = await q.order("created_at", { ascending: false }).limit(1000);
  if (imp.error) throw new Error(imp.error.message);
  return {
    ultimoRicalcolo,
    ...valutaImportCompleti(ultimoRicalcolo, (imp.data ?? []) as RigaImportFido[], ora),
  };
}

export function elencoMancantiTesto(stato: StatoImportCompleti): string {
  return stato.mancanti
    .map((f) => ETICHETTE_FONTI_FIDO_TEORICO[f])
    .join(", ");
}
