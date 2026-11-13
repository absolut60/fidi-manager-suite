import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parametriArticoli, type FiltriArticoli } from "./catalogo-articoli";
import { z } from "zod";
import { compattaTerne } from "./filtri-catalogo-articoli";
import { contaPreventiviArticolo, ordinaFornitoriArticolo } from "./scheda-articolo";

export const elencoArticoliGamma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FiltriArticoli) => z.object({ search: z.string(), famiglie: z.array(z.string()), sottofamiglie: z.array(z.string()), marche: z.array(z.string()), fornitori: z.array(z.string().uuid()), stati: z.array(z.string()), disponibileIn: z.array(z.string()), listino: z.number(), ordina: z.string(), dir: z.string(), page: z.number().finite() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("cerca_articoli", parametriArticoli(data));
    if (error) throw new Error(error.message);
    // Pagina oltre la fine (es. dopo un filtro): nessuna seconda chiamata, la pagina torna a 1.
    if (!rows?.length && data.page > 1) return { rows: [], total: 0, fuoriPagina: true };
    return { rows: rows ?? [], total: Number(rows?.[0]?.totale ?? 0), fuoriPagina: false };
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
    // FM63: sedi per "Disponibile in" (propria in cima) e contesto listino della sede da facets_articoli.
    const parsed = z.object({ famiglie: z.array(facetSchema), sottofamiglie: z.array(facetSchema.extend({ famiglia: z.string().nullable() })), marche: z.array(facetSchema),
      sedi: z.array(z.object({ id: z.string(), nome: z.string().nullable(), propria: z.boolean() })), globale: z.boolean().nullable(), listino_sede: z.number().nullable() }).parse(facets.data);
    return { ...parsed, globale: parsed.globale !== false, listini: (listini.data ?? []).filter(l => [10, 20, 30].includes(l.codice)) };
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
    const { data: articolo, error } = await context.supabase.from("articoli_gamma").select("*,marche(descrizione),fornitore:fornitori!articoli_gamma_fornitore_pref_id_fkey(id,ragione_sociale,stato_convenzione)").eq("codice", data.codice).maybeSingle();
    if (error) throw new Error(error.message);
    if (!articolo) return null;
    const escaped = data.codice.replace(/[\\%_]/g, "\\$&");
    // FM63: prices only from listini_articolo_visibili (site visibility rule lives in SQL).
    const [prezzi, sede, tecnici, permesso, fornitori] = await Promise.all([
      context.supabase.rpc("listini_articolo_visibili", { _codice: data.codice }),
      context.supabase.rpc("auth_listini_sede"),
      context.supabase.from("articoli").select("id,cod_gamma,categoria,tipologia,componente,qta_cliente,qta_fornitore,peso_unit,note,note_acquisto").like("cod_gamma", `%${escaped}%`),
      context.supabase.rpc("auth_puo_gestire_anagrafiche_prev"),
      context.supabase.from("articoli_gamma_fornitori").select("fornitore_codice,codice_articolo_fornitore,preferenziale,fornitore:fornitori(id,ragione_sociale)").eq("articolo_codice", data.codice),
    ]);
    for (const result of [prezzi, sede, tecnici, permesso, fornitori]) if (result.error) throw new Error(result.error.message);
    // FM62: "fornitore obsoleto" deciso solo da public.fornitore_obsoleto (campo calcolato PostgREST).
    const idsFornitori = [...new Set([articolo.fornitore?.id, ...(fornitori.data ?? []).map((r) => r.fornitore?.id)].filter((v): v is string => !!v))];
    const obsoleti = new Set<string>();
    if (idsFornitori.length) {
      const o = await context.supabase.from("fornitori").select("id,fornitore_obsoleto" as "id").in("id", idsFornitori);
      if (o.error) throw new Error(o.error.message);
      for (const r of (o.data ?? []) as unknown as { id: string; fornitore_obsoleto: boolean | null }[]) if (r.fornitore_obsoleto) obsoleti.add(r.id);
    }
    const conObsoleto = <T extends { id: string; ragione_sociale: string | null } | null>(x: T) => x ? { ...x, fornitore_obsoleto: obsoleti.has(x.id) } : null;
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
    return { ...articolo, fornitore: conObsoleto(articolo.fornitore), listiniVisibili: prezzi.data ?? [],
      globale: sede.data?.[0]?.globale ?? true, storeIdUtente: sede.data?.[0]?.globale === false ? sede.data[0].store_id : null,
      tecnico, fornitori: ordinaFornitoriArticolo((fornitori.data ?? []).map((r) => ({ ...r, fornitore: conObsoleto(r.fornitore) }))), utilizzo,
      puoModificareTecnici: permesso.data === true };
  });

export const disponibilitaSchedaArticolo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { codice: string }) => z.object({ codice: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("disponibilita_articolo", { _codice: data.codice });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });
/** FM65 F1: terne famiglia/sottofamiglia/marca degli articoli attivi in uso o in esaurimento, per i filtri a cascata calcolati in TS (F2). */
const ternaSchema = z.object({ codice_famiglia: z.string().nullable(), famiglia: z.string().nullable(), codice_sottofamiglia: z.string().nullable(),
  sottofamiglia: z.string().nullable(), marca_codice: z.string().nullable(), marca: z.string().nullable(), conteggio: z.coerce.number() });
export type { TernaArticoliFiltri } from "./filtri-catalogo-articoli";
export const terneArticoliFiltri = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("terne_articoli_filtri");
    if (error) throw new Error(error.message);
    // FM65 F2: formato compatto (dizionari + indici), senza perdita; espanso da espandiTerne.
    return compattaTerne(z.array(ternaSchema).parse(data ?? []));
  });
