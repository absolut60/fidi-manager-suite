import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  elencoAttivitaFornitoreInput, creaAttivitaFornitoreInput, aggiornaAttivitaFornitoreInput, eliminaAttivitaFornitoreInput,
  type FiltriAttivitaFornitore, type AttivitaFornitore,
} from "./attivita-fornitore";
export type { AttivitaFornitore, FiltriAttivitaFornitore } from "./attivita-fornitore";

type Crea = import("zod").input<typeof creaAttivitaFornitoreInput>;
type Aggiorna = import("zod").input<typeof aggiornaAttivitaFornitoreInput>;
const COLONNE = "id,fornitore_id,tipo,origine,data_attivita,oggetto,corpo,esito,destinatari,cc,ccn,stato,errore,creato_da";

export const elencoAttivitaFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriAttivitaFornitore) => elencoAttivitaFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("attivita_fornitore").select(COLONNE, { count: "exact" })
      .eq("fornitore_id", data.fornitoreId).order("data_attivita", { ascending: false }).order("id")
      .range(data.offset, data.offset + data.limite - 1);
    if (data.tipi?.length) q = q.in("tipo", data.tipi);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    const rows = res.data ?? [];
    const ids = rows.map(r => r.id);
    const conteggi = new Map<string, number>();
    if (ids.length) {
      const all = await context.supabase.from("allegati").select("entita_id").eq("entita_tipo", "attivita_fornitore").in("entita_id", ids);
      if (all.error) throw new Error(all.error.message);
      for (const a of all.data ?? []) conteggi.set(a.entita_id, (conteggi.get(a.entita_id) ?? 0) + 1);
    }
    const nomi = new Map<string, string>();
    if (rows.some(r => r.creato_da)) {
      const n = await context.supabase.rpc("get_nomi_utenti" as never);
      if (!n.error) for (const p of (n.data ?? []) as unknown as { id: string; nome: string | null; cognome: string | null }[]) {
        const s = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim(); if (s) nomi.set(p.id, s);
      }
    }
    const out: AttivitaFornitore[] = rows.map(r => ({ ...r, origine: r.origine as AttivitaFornitore["origine"], operatore: r.creato_da ? nomi.get(r.creato_da) ?? null : null, n_allegati: conteggi.get(r.id) ?? 0 }));
    return { rows: out, total: res.count ?? out.length };
  });

export const creaAttivitaFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Crea) => creaAttivitaFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("attivita_fornitore").insert({
      fornitore_id: data.fornitoreId, tipo: data.tipo, data_attivita: data.dataAttivita,
      oggetto: data.oggetto ?? null, corpo: data.corpo ?? null, esito: data.esito ?? null,
      origine: "manuale", stato: "registrata", creato_da: context.userId,
    }).select("id").single();
    if (res.error) throw new Error(res.error.code === "42501" ? "Accesso non consentito" : res.error.message);
    return { id: res.data.id };
  });

export const aggiornaAttivitaFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Aggiorna) => aggiornaAttivitaFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("attivita_fornitore").update({
      tipo: data.tipo, data_attivita: data.dataAttivita, oggetto: data.oggetto ?? null, corpo: data.corpo ?? null, esito: data.esito ?? null,
    }).eq("id", data.id).eq("origine", "manuale").select("id");
    if (res.error) throw new Error(res.error.message);
    if (!res.data?.length) throw new Error("Attività non modificabile");
    return { ok: true };
  });

export const eliminaAttivitaFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => eliminaAttivitaFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("attivita_fornitore").delete().eq("id", data.id).eq("origine", "manuale").select("id");
    if (res.error) throw new Error(res.error.message);
    if (!res.data?.length) throw new Error("Attività non eliminabile");
    return { ok: true };
  });
