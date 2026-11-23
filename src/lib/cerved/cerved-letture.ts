import { supabase } from "@/integrations/supabase/client";
import { colonnaEntitaCerved, type EntitaCerved } from "./cerved-entita";

/** Dimensione dei blocchi per le letture `.in(...)`. */
export const BLOCCO_LETTURE_CERVED = 150;

type ClientMinimo = { from: (t: string) => any };

/**
 * FM90: fonte unica lato schermo. Il dato Cerved (report, fotografie) appartiene al soggetto:
 * le schermate leggono sempre per id_soggetto ottenuto da cerved_soggetti, mai per cliente_id/lead_id.
 */
export async function idSoggettoDiEntita(entita: EntitaCerved, id: string, client: ClientMinimo = supabase): Promise<number | null> {
  const { data, error } = await client.from("cerved_soggetti").select("id_soggetto")
    .eq(colonnaEntitaCerved(entita), id).maybeSingle();
  if (error) throw error;
  return (data?.id_soggetto as number | undefined) ?? null;
}

/** Map id entità → id_soggetto (solo entità collegate), letta a blocchi. */
export async function idSoggettiDiEntita(entita: EntitaCerved, ids: string[], client: ClientMinimo = supabase): Promise<Map<string, number>> {
  const col = colonnaEntitaCerved(entita);
  const out = new Map<string, number>();
  const unici = [...new Set(ids)];
  for (let i = 0; i < unici.length; i += BLOCCO_LETTURE_CERVED) {
    const blocco = unici.slice(i, i + BLOCCO_LETTURE_CERVED);
    const { data, error } = await client.from("cerved_soggetti").select(`${col}, id_soggetto`).in(col, blocco);
    if (error) throw error;
    for (const r of (data ?? []) as Record<string, string | number | null>[]) {
      const e = r[col]; const s = r["id_soggetto"];
      if (typeof e === "string" && s != null) out.set(e, Number(s));
    }
  }
  return out;
}

/**
 * FM100: fonte unica della lettura del Light Report salvato di un'entità (hook useLightReportEntita
 * e server function del grafico): ultima fotografia 'light_report' del soggetto collegato, con la RLS del client.
 */
export async function ultimoLightReportDiEntita(entita: EntitaCerved, id: string, client: ClientMinimo = supabase): Promise<Record<string, any> | null> {
  const idSoggetto = await idSoggettoDiEntita(entita, id, client);
  if (!idSoggetto) return null;
  const { data, error } = await client.from("cerved_fotografie")
    .select("dati, letta_il").eq("id_soggetto", idSoggetto).eq("tipo", "light_report")
    .order("letta_il", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.dati as Record<string, any> | undefined) ?? null;
}
