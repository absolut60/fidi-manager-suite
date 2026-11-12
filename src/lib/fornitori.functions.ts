import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  elencoFornitoriInput, dettaglioFornitoreInput, articoliFornitoreInput,
  salvaNoteFornitoreInput, dettaglioFornitoreSchema, idsFornitoriInput,
  type FiltriIdsFornitori,
  type FiltriFornitori, type FiltriArticoliFornitore,
} from "./fornitori";
export type { FiltriFornitori, FiltriArticoliFornitore, FornitoreElenco, ArticoloFornitore, DettaglioFornitore } from "./fornitori";

export const elencoFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriFornitori) => elencoFornitoriInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("cerca_fornitori", {
      _testo: data.testo ?? undefined, _anche_cliente: data.ancheCliente ?? undefined,
      _con_articoli: data.conArticoli ?? undefined, _includi_manuali: data.includiManuali,
      _macrocategorie: data.macrocategorie?.length ? data.macrocategorie : undefined,
      _con_email: data.conEmail ?? undefined, _limite: data.limite, _offset: data.offset,
    });
    if (result.error) throw new Error(result.error.message);
    const rows = result.data ?? [];
    if (!rows.length && data.offset > 0) {
      const first = await context.supabase.rpc("cerca_fornitori", {
        _testo: data.testo ?? undefined, _anche_cliente: data.ancheCliente ?? undefined,
        _con_articoli: data.conArticoli ?? undefined, _includi_manuali: data.includiManuali,
        _macrocategorie: data.macrocategorie?.length ? data.macrocategorie : undefined,
        _con_email: data.conEmail ?? undefined, _limite: 1, _offset: 0,
      });
      if (first.error) throw new Error(first.error.message);
      return { rows, total: Number(first.data?.[0]?.totale ?? 0) };
    }
    return { rows, total: Number(rows[0]?.totale ?? 0) };
  });

export const dettaglioFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => dettaglioFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("dettaglio_fornitore", { _id: data.id });
    if (result.error) throw new Error(result.error.message);
    return result.data === null ? null : dettaglioFornitoreSchema.parse(result.data);
  });

export const articoliFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriArticoliFornitore) => articoliFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const args = { _fornitore_id: data.fornitoreId, _testo: data.testo ?? undefined,
      _solo_preferenziali: data.soloPreferenziali, _limite: data.limite, _offset: data.offset };
    const result = await context.supabase.rpc("articoli_fornitore", args);
    if (result.error) throw new Error(result.error.message);
    const rows = result.data ?? [];
    if (!rows.length && data.offset > 0) {
      const first = await context.supabase.rpc("articoli_fornitore", { ...args, _limite: 1, _offset: 0 });
      if (first.error) throw new Error(first.error.message);
      return { rows, total: Number(first.data?.[0]?.totale ?? 0) };
    }
    return { rows, total: Number(rows[0]?.totale ?? 0) };
  });

export const salvaNoteFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; note: string | null }) => salvaNoteFornitoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("aggiorna_note_fornitore", { _id: data.id, _note: data.note ?? "" });
    if (result.error) throw new Error(result.error.message);
    return { success: true };
  });
/** Id di tutti i fornitori filtrati (stessa base di cerca_fornitori, nessun ciclo a blocchi). */
export const idsFornitoriFiltrati = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriIdsFornitori) => idsFornitoriInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("cerca_fornitori_ids", {
      _testo: data.testo ?? undefined, _anche_cliente: data.ancheCliente ?? undefined,
      _con_articoli: data.conArticoli ?? undefined, _includi_manuali: data.includiManuali,
      _macrocategorie: data.macrocategorie?.length ? data.macrocategorie : undefined,
      _con_email: data.conEmail ?? undefined,
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as string[];
  });
