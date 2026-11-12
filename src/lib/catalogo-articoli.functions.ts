import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parametriArticoli, type FiltriArticoli } from "./catalogo-articoli";
import { z } from "zod";
import { contaPreventiviArticolo, ordinaFornitoriArticolo } from "./scheda-articolo";

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
    const { data: articolo, error } = await context.supabase.from("articoli_gamma").select("*,marche(descrizione),fornitore:fornitori!articoli_gamma_fornitore_pref_id_fkey(id,ragione_sociale)").eq("codice", data.codice).maybeSingle();
    if (error) throw new Error(error.message);
    if (!articolo) return null;
    const escaped = data.codice.replace(/[\\%_]/g, "\\$&");
    const [prezzi, listini, tecnici, permesso, fornitori] = await Promise.all([
      context.supabase.from("articoli_gamma_listini").select("*").eq("articolo_codice", data.codice),
      context.supabase.from("listini_gamma").select("codice,descrizione"),
      context.supabase.from("articoli").select("id,cod_gamma,categoria,tipologia,componente,qta_cliente,qta_fornitore,peso_unit,note,note_acquisto").like("cod_gamma", `%${escaped}%`),
      context.supabase.rpc("auth_puo_gestire_anagrafiche_prev"),
      context.supabase.from("articoli_gamma_fornitori").select("fornitore_codice,codice_articolo_fornitore,preferenziale,fornitore:fornitori(id,ragione_sociale)").eq("articolo_codice", data.codice),
    ]);
    for (const result of [prezzi, listini, tecnici, permesso, fornitori]) if (result.error) throw new Error(result.error.message);
    const tecnico = tecnici.data?.find((a) => a.cod_gamma?.trim() === data.codice) ?? null;
    const utilizzo = tecnico ? await (async () => {
      const [kit, preventivi] = await Promise.all([
        context.supabase.from("kit_componenti").select("id,ruolo,kit:kit(id,nome)").eq("articolo_id", tecnico.id),
        (async () => {
          const rows: { blocchi_preventivo: { preventivo_id: string } | null }[] = [];
          // PostgREST caps pages at 1,000 rows: count distinct documents over all pages.
          for (let offset = 0; ; offset += 1000) {
            const page = await context.supabase.from("righe_preventivo").select("id,blocchi_preventivo!inner(preventivo_id)").eq("articolo_id", tecnico.id).order("id").range(offset, offset + 999);
            if (page.error) throw new Error(page.error.message);
            rows.push(...(page.data ?? []));
            if ((page.data?.length ?? 0) < 1000) break;
          }
          return contaPreventiviArticolo(rows);
        })(),
      ]);
      if (kit.error) throw new Error(kit.error.message);
      return { kit: (kit.data ?? []).sort((a, b) => (a.kit?.nome ?? "").localeCompare(b.kit?.nome ?? "", "it-IT")), preventivi };
    })() : null;
    return { ...articolo, prezzi: prezzi.data ?? [], listini: listini.data ?? [],
      tecnico, fornitori: ordinaFornitoriArticolo(fornitori.data ?? []), utilizzo,
      puoModificareTecnici: permesso.data === true };
  });

export const disponibilitaSchedaArticolo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { codice: string }) => z.object({ codice: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("disponibilita_articolo", { _codice: data.codice });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });