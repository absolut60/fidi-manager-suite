import { normalizzaLightReportXml } from "./cerved.server";

/**
 * FM99 — Rilettura dei Light Report già salvati dagli XML originali in cerved_chiamate.
 * Aggiorna SOLO cerved_fotografie.dati della stessa riga: nessuna nuova fotografia,
 * letta_il invariato, nessuna chiamata a Cerved. Idempotente.
 *
 * Origine dell'XML: cerved_fotografie.chiamata_id → cerved_chiamate.risposta.contenuto_xml
 * (scritta da recuperaESalvaLightReport). In mancanza: ultima chiamata 'document_retrieve'
 * con esito ok il cui risposta.request_id è un request_id di cerved_report dello stesso id_soggetto.
 */
export type EsitoRilettura = { lette: number; aggiornate: number; senza_xml: number; errori: string[] };

type Db = { from: (t: string) => any };

async function xmlDaChiamata(db: Db, id: string): Promise<string | null> {
  const { data, error } = await db.from("cerved_chiamate").select("risposta").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const x = (data?.risposta as { contenuto_xml?: unknown } | null)?.contenuto_xml;
  return typeof x === "string" && x ? x : null;
}

async function xmlDiRipiego(db: Db, idSoggetto: number): Promise<string | null> {
  const { data: rep, error } = await db.from("cerved_report").select("request_id").eq("id_soggetto", idSoggetto);
  if (error) throw new Error(error.message);
  const ids = ((rep ?? []) as { request_id: string | null }[]).map((r) => r.request_id).filter((r): r is string => !!r);
  if (!ids.length) return null;
  const { data: ch, error: e2 } = await db.from("cerved_chiamate").select("id")
    .eq("operazione", "document_retrieve").eq("esito", "ok").in("risposta->>request_id", ids)
    .not("risposta->>contenuto_xml", "is", null).order("created_at", { ascending: false }).limit(1);
  if (e2) throw new Error(e2.message);
  const id = (ch as { id: string }[] | null)?.[0]?.id;
  return id ? xmlDaChiamata(db, id) : null;
}

export async function rileggiLightReport(db: Db): Promise<EsitoRilettura> {
  const { data, error } = await db.from("cerved_fotografie").select("id, chiamata_id, id_soggetto").eq("tipo", "light_report");
  if (error) throw new Error("Impossibile leggere i report Cerved salvati");
  const esito: EsitoRilettura = { lette: 0, aggiornate: 0, senza_xml: 0, errori: [] };
  for (const f of (data ?? []) as { id: string; chiamata_id: string | null; id_soggetto: number }[]) {
    esito.lette++;
    try {
      const xml = (f.chiamata_id ? await xmlDaChiamata(db, f.chiamata_id) : null) ?? await xmlDiRipiego(db, f.id_soggetto);
      if (!xml) { esito.senza_xml++; continue; }
      const { error: eu } = await db.from("cerved_fotografie").update({ dati: normalizzaLightReportXml(xml) }).eq("id", f.id);
      if (eu) throw new Error(eu.message);
      esito.aggiornate++;
    } catch (e) {
      esito.errori.push(`Report ${f.id}: ${e instanceof Error ? e.message : "errore"}`);
    }
  }
  return esito;
}
