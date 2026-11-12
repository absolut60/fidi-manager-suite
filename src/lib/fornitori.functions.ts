import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  elencoFornitoriInput, dettaglioFornitoreInput, articoliFornitoreInput,
  salvaNoteFornitoreInput, dettaglioFornitoreSchema, idsFornitoriInput, classificaFornitoriInput, impostaStatoConvenzioneInput, impostaMarcaInput, impostaSottocategoriaInput, opzioniFornitoriSchema,
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
      _con_email: data.conEmail ?? undefined, _tipi: data.tipi?.length ? data.tipi : undefined, _stati_convenzione: data.statiConvenzione?.length ? data.statiConvenzione : undefined,
      _includi_obsoleti: data.includiObsoleti, _marche: data.marche?.length ? data.marche : undefined, _sottocategorie: data.sottocategorie?.length ? data.sottocategorie : undefined, _ordina: data.ordina, _direzione: data.direzione, _limite: data.limite, _offset: data.offset,
    });
    if (result.error) throw new Error(result.error.message);
    const rows = result.data ?? [];
    if (!rows.length && data.offset > 0) {
      const first = await context.supabase.rpc("cerca_fornitori", {
        _testo: data.testo ?? undefined, _anche_cliente: data.ancheCliente ?? undefined,
        _con_articoli: data.conArticoli ?? undefined, _includi_manuali: data.includiManuali,
        _macrocategorie: data.macrocategorie?.length ? data.macrocategorie : undefined,
        _con_email: data.conEmail ?? undefined, _tipi: data.tipi?.length ? data.tipi : undefined, _stati_convenzione: data.statiConvenzione?.length ? data.statiConvenzione : undefined,
      _includi_obsoleti: data.includiObsoleti, _marche: data.marche?.length ? data.marche : undefined, _sottocategorie: data.sottocategorie?.length ? data.sottocategorie : undefined, _limite: 1, _offset: 0,
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
      _con_email: data.conEmail ?? undefined, _tipi: data.tipi?.length ? data.tipi : undefined, _stati_convenzione: data.statiConvenzione?.length ? data.statiConvenzione : undefined,
      _includi_obsoleti: data.includiObsoleti, _marche: data.marche?.length ? data.marche : undefined, _sottocategorie: data.sottocategorie?.length ? data.sottocategorie : undefined,
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as string[];
  });

/** FM62 F6: "Classifica come…" — scrive solo dove Gamma non decide; ritorna i conteggi. */
export const classificaFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; tipo: "merci" | "servizi" }) => classificaFornitoriInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("classifica_fornitori", { _ids: data.ids, _tipo: data.tipo });
    if (result.error) throw new Error(result.error.message.includes("Accesso non consentito") ? "Accesso non consentito" : result.error.message);
    const r = (result.data ?? {}) as { aggiornati?: number; saltati_gamma?: number; non_trovati?: number };
    return { aggiornati: r.aggiornati ?? 0, saltatiGamma: r.saltati_gamma ?? 0, nonTrovati: r.non_trovati ?? 0 };
  });

/** FM62 F7: stato convenzione (solo amministratore); con "convenzionato" anche tipo Merci dove Gamma non decide. */
export const impostaStatoConvenzioneFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; stato: "convenzionato" | "non_convenzionato" }) => impostaStatoConvenzioneInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("imposta_stato_convenzione_fornitori", { _ids: data.ids, _stato: data.stato });
    if (result.error) throw new Error(result.error.message.includes("Accesso non consentito") ? "Accesso non consentito: solo l'amministratore può cambiare la convenzione" : result.error.message);
    const r = (result.data ?? {}) as { aggiornati?: number; impostati_merci?: number; in_conflitto?: number };
    return { aggiornati: r.aggiornati ?? 0, impostatiMerci: r.impostati_merci ?? 0, inConflitto: r.in_conflitto ?? 0 };
  });

const erroreAdmin = (m: string) => m.includes("Accesso non consentito") ? "Accesso non consentito: solo l'amministratore può farlo" : m;
/** FM62: marche e sottocategorie per filtri e scelte (marche lette via RPC: amministrazione non vede la tabella). */
export const opzioniFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase.rpc("opzioni_fornitori");
    if (result.error) throw new Error(result.error.message);
    return opzioniFornitoriSchema.parse(result.data);
  });
/** FM62: marca impostata a mano (solo amministratore); null = nessuna marca. */
export const impostaMarcaFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; marca: string | null }) => impostaMarcaInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("imposta_marca_fornitori", { _ids: data.ids, _marca_codice: data.marca as string });
    if (result.error) throw new Error(erroreAdmin(result.error.message));
    return { aggiornati: Number((result.data as { aggiornati?: number } | null)?.aggiornati ?? 0) };
  });
/** FM62: sottocategoria servizi (solo amministratore, solo fornitori di servizi); null = togli. */
export const impostaSottocategoriaFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; codice: string | null }) => impostaSottocategoriaInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("imposta_sottocategoria_fornitori", { _ids: data.ids, _codice: data.codice as string });
    if (result.error) throw new Error(erroreAdmin(result.error.message));
    return { aggiornati: Number((result.data as { aggiornati?: number } | null)?.aggiornati ?? 0) };
  });
