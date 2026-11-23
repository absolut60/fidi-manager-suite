import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BLOCCO_LETTURE_CERVED, ultimoLightReportDiEntita } from "./cerved-letture";
import type { EntitaCerved } from "./cerved-entita";
import type { LightReportCerved } from "./cerved.server";
import { chiaveFiscaleValida, chiaviFiscaliGrafo, costruisciGrafoCerved, type ClienteMadeGrafo } from "../cerved-grafo";
import { FIDO_CLIENTE_SELECT, getFidoAttuale } from "../fido-cliente";

const schema = z.object({ entita: z.enum(["cliente", "lead"]), id: z.string().uuid() });
type Contesto = { supabase: any };

/**
 * FM100: dati MADE dei clienti collegati al grafico Cerved. Visibilità solo dalla RLS dell'utente sul
 * Light Report salvato (stessa lettura dello schermo); i dati dei clienti trovati si leggono poi come amministratore.
 * `visibile` = l'utente vede il cliente con la propria RLS ("Apri scheda").
 */
export async function eseguiDatiMadeGrafoCerved(entita: EntitaCerved, id: string, context: Contesto): Promise<{ clienti: ClienteMadeGrafo[] }> {
  const lr = (await ultimoLightReportDiEntita(entita, id, context.supabase)) as LightReportCerved | null;
  if (!lr) return { clienti: [] };
  const a = lr.anagrafica;
  const grafo = costruisciGrafoCerved(lr, { nome: a?.denominazione ?? null, partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null });
  const chiavi = chiaviFiscaliGrafo(grafo.nodi);
  if (!chiavi.length) return { clienti: [] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const righe = new Map<string, any>();
  for (let i = 0; i < chiavi.length; i += BLOCCO_LETTURE_CERVED) {
    const b = chiavi.slice(i, i + BLOCCO_LETTURE_CERVED).join(",");
    const { data, error } = await supabaseAdmin.from("clienti")
      .select(`id, ragione_sociale, codice_gestionale, store_id, partita_iva, codice_fiscale, totale_rischio, bloccato, in_gestione_legale, ${FIDO_CLIENTE_SELECT}, stores(nome)`)
      .or(`partita_iva.in.(${b}),codice_fiscale.in.(${b})`);
    if (error) throw new Error("Impossibile leggere i clienti MADE collegati");
    for (const r of data ?? []) righe.set(r.id, r);
  }
  if (!righe.size) return { clienti: [] };
  const ids = [...righe.keys()];
  const scaduti = new Map<string, { eur_scaduto: number; eur_grave: number }>();
  const visibili = new Set<string>();
  for (let i = 0; i < ids.length; i += BLOCCO_LETTURE_CERVED) {
    const b = ids.slice(i, i + BLOCCO_LETTURE_CERVED);
    const { data: sc, error } = await supabaseAdmin.rpc("scaduto_semaforo_batch", { _ids: b });
    if (error) throw new Error("Impossibile leggere lo scaduto dei clienti collegati");
    for (const s of sc ?? []) scaduti.set(s.cliente_id, s);
    const { data: vis } = await context.supabase.from("clienti").select("id").in("id", b);
    for (const v of vis ?? []) visibili.add(v.id);
  }
  const insieme = new Set(chiavi);
  const out: ClienteMadeGrafo[] = [];
  for (const r of righe.values()) {
    const proprie = [...new Set([chiaveFiscaleValida(r.partita_iva), chiaveFiscaleValida(r.codice_fiscale)].filter((k): k is string => !!k && insieme.has(k)))];
    const s = scaduti.get(r.id);
    for (const chiave of proprie) out.push({
      chiave, cliente_id: r.id, ragione_sociale: r.ragione_sociale ?? null, codice: r.codice_gestionale ?? null,
      sede: (Array.isArray(r.stores) ? r.stores[0]?.nome : r.stores?.nome) ?? null,
      fido: getFidoAttuale(r), esposizione: r.totale_rischio == null ? null : Number(r.totale_rischio),
      scaduto: Number(s?.eur_scaduto ?? 0), scaduto_oltre_60: Number(s?.eur_grave ?? 0),
      bloccato: !!r.bloccato, in_gestione_legale: !!r.in_gestione_legale,
      visibile: visibili.has(r.id), e_questo_cliente: entita === "cliente" && r.id === id,
    });
  }
  return { clienti: out };
}

export const datiMadeGrafoCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entita: EntitaCerved; id: string }) => schema.parse(d))
  .handler(async ({ data, context }) => eseguiDatiMadeGrafoCerved(data.entita, data.id, context));
