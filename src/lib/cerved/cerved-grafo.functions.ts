import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BLOCCO_LETTURE_CERVED, ultimoLightReportDiEntita } from "./cerved-letture";
import type { EntitaCerved } from "./cerved-entita";
import type { LightReportCerved } from "./cerved.server";
import { chiaveFiscaleValida, chiaviFiscaliGrafo, componiClientiGrafo, componiLeadGrafo, costruisciGrafoCerved, type ClienteMadeGrafo, type LeadMadeGrafo, type RigaLeadGrafo } from "../cerved-grafo";
import { FIDO_CLIENTE_SELECT } from "../fido-cliente";

const schema = z.object({ entita: z.enum(["cliente", "lead"]), id: z.string().uuid() });
type Contesto = { supabase: any };

/**
 * FM100: dati MADE dei clienti collegati al grafico Cerved. Visibilità solo dalla RLS dell'utente sul
 * Light Report salvato (stessa lettura dello schermo); i dati dei clienti trovati si leggono poi come amministratore.
 * `visibile` = l'utente vede il cliente con la propria RLS ("Apri scheda").
 */
export async function eseguiDatiMadeGrafoCerved(entita: EntitaCerved, id: string, context: Contesto): Promise<{ clienti: ClienteMadeGrafo[]; lead: LeadMadeGrafo[] }> {
  const lr = (await ultimoLightReportDiEntita(entita, id, context.supabase)) as LightReportCerved | null;
  if (!lr) return { clienti: [], lead: [] };
  const a = lr.anagrafica;
  const grafo = costruisciGrafoCerved(lr, { nome: a?.denominazione ?? null, partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null });
  const chiaviCentro = [...new Set([chiaveFiscaleValida(a?.partita_iva), chiaveFiscaleValida(a?.codice_fiscale)].filter((k): k is string => !!k))];
  const chiavi = [...new Set([...chiaviFiscaliGrafo(grafo.nodi), ...chiaviCentro])];
  if (!chiavi.length) return { clienti: [], lead: [] };

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
  const lead = await leggiLeadGrafo(chiavi, entita === "lead" ? id : null, context, supabaseAdmin);
  if (!righe.size) return { clienti: [], lead };
  const ids = [...righe.keys()];
  const scaduti = new Map<string, { eur_scaduto: number; eur_grave: number }>();
  const visibili = new Set<string>();
  const scadutiAlert = new Set<string>();
  for (let i = 0; i < ids.length; i += BLOCCO_LETTURE_CERVED) {
    const b = ids.slice(i, i + BLOCCO_LETTURE_CERVED);
    // Regola Alert fidi già calcolata: nessuna soglia locale.
    const { data: ft, error: ef } = await supabaseAdmin.from("fido_teorico_v2").select("cliente_id").in("cliente_id", b).eq("regola", "scaduto_non_incassato");
    if (ef) throw new Error("Impossibile leggere il fido teorico dei clienti collegati");
    for (const f of ft ?? []) scadutiAlert.add(f.cliente_id);
    const { data: sc, error } = await supabaseAdmin.rpc("scaduto_semaforo_batch", { _ids: b });
    if (error) throw new Error("Impossibile leggere lo scaduto dei clienti collegati");
    for (const s of sc ?? []) scaduti.set(s.cliente_id, s);
    const { data: vis } = await context.supabase.from("clienti").select("id").in("id", b);
    for (const v of vis ?? []) visibili.add(v.id);
  }
  const out = componiClientiGrafo([...righe.values()], { chiavi, chiaviCentro, scaduti, visibili, scadutiAlert, entita, id });
  return { clienti: out, lead };
}

/** Lead non ancora collegati a un cliente con P.IVA/CF fra le chiavi (escluso il lead della scheda); `visibile` = RLS dell'utente. */
async function leggiLeadGrafo(chiavi: string[], escludi: string | null, context: Contesto, admin: any): Promise<LeadMadeGrafo[]> {
  const righe = new Map<string, RigaLeadGrafo>();
  for (let i = 0; i < chiavi.length; i += BLOCCO_LETTURE_CERVED) {
    const b = chiavi.slice(i, i + BLOCCO_LETTURE_CERVED).join(",");
    const { data, error } = await admin.from("lead").select("id, ragione_sociale, stato, partita_iva, codice_fiscale, cliente_id")
      .is("cliente_id", null).or(`partita_iva.in.(${b}),codice_fiscale.in.(${b})`);
    if (error) throw new Error("Impossibile leggere i lead collegati");
    for (const r of data ?? []) righe.set(r.id, r);
  }
  const ids = [...righe.keys()].filter((x) => x !== escludi);
  const visibili = new Set<string>();
  for (let i = 0; i < ids.length; i += BLOCCO_LETTURE_CERVED) {
    const { data } = await context.supabase.from("lead").select("id").in("id", ids.slice(i, i + BLOCCO_LETTURE_CERVED));
    for (const v of data ?? []) visibili.add(v.id);
  }
  return componiLeadGrafo([...righe.values()], { chiavi, visibili, escludi });
}

export const datiMadeGrafoCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entita: EntitaCerved; id: string }) => schema.parse(d))
  .handler(async ({ data, context }) => eseguiDatiMadeGrafoCerved(data.entita, data.id, context));
