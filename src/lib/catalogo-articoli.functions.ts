import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parametriArticoli, type FiltriArticoli } from "./catalogo-articoli";
import { z } from "zod";

export const elencoArticoliGamma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriArticoli) => z.object({ search: z.string(), famiglie: z.array(z.string()), sottofamiglie: z.array(z.string()), marche: z.array(z.string()), fornitori: z.array(z.string().uuid()), stati: z.array(z.string()), soloDisponibili: z.boolean(), listino: z.number(), page: z.number().finite() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("cerca_articoli", parametriArticoli(data));
    if (error) throw new Error(error.message);
    if (!rows?.length && data.page > 1) {
      const first = await context.supabase.rpc("cerca_articoli", { ...parametriArticoli(data), offset: 0, limite: 1 });
      if (first.error) throw new Error(first.error.message);
      return { rows: rows ?? [], total: Number(first.data?.[0]?.totale ?? 0) };
    }
    return { rows: rows ?? [], total: Number(rows?.[0]?.totale ?? 0) };
  });

const facetSchema = z.object({ codice: z.string(), descrizione: z.string().nullable(), conteggio: z.number() });
export const facetsArticoliGamma = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [facets, listini] = await Promise.all([
      context.supabase.rpc("facets_articoli"),
      context.supabase.from("listini_gamma").select("codice,descrizione").order("codice"),
    ]);
    if (facets.error) throw new Error(facets.error.message);
    if (listini.error) throw new Error(listini.error.message);
    return { ...z.object({ famiglie: z.array(facetSchema), sottofamiglie: z.array(facetSchema.extend({ famiglia: z.string().nullable() })), marche: z.array(facetSchema) }).parse(facets.data), listini: listini.data };
  });

export const fornitoriArticoliGamma = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { testo: string; selezionati: string[] }) => z.object({ testo: z.string(), selezionati: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("cerca_fornitori_articoli", data);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const dettaglioArticoloGamma = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { codice: string }) => z.object({ codice: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: articolo, error } = await context.supabase.from("articoli_gamma").select("codice,descrizione,marche(descrizione)").eq("codice", data.codice).maybeSingle();
    if (error) throw new Error(error.message);
    return articolo;
  });