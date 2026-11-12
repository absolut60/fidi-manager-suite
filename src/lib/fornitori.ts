import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/** FM62 F6: valori di public.tipo_fornitore_effettivo. */
export const TIPI_FORNITORE = ["merci", "servizi", "da_classificare"] as const;
export type TipoFornitore = typeof TIPI_FORNITORE[number];
export const MAX_CLASSIFICA_FORNITORI = 5000;
/** FM62 F7: stati convenzione (estendibile: aggiungere qui e nel CHECK fornitori_stato_convenzione_chk). */
export const STATI_CONVENZIONE = ["convenzionato", "non_convenzionato"] as const;
export type StatoConvenzione = typeof STATI_CONVENZIONE[number];
export const ETICHETTE_CONVENZIONE: Record<StatoConvenzione, string> = { convenzionato: "Convenzionato", non_convenzionato: "Non convenzionato" };
/** Imposta lo stato convenzione in blocco (solo amministratore; stesso limite della classificazione). */
export const impostaStatoConvenzioneInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Nessun fornitore selezionato").max(MAX_CLASSIFICA_FORNITORI, `Massimo ${MAX_CLASSIFICA_FORNITORI} fornitori per volta`),
  stato: z.enum(STATI_CONVENZIONE),
});
/** Valore speciale dei filtri marca/sottocategoria (gemello SQL in _fornitori_filtrati). */
export const VALORE_NESSUNA = "__nessuna__";
const idsSelezione = z.array(z.string().uuid()).min(1, "Nessun fornitore selezionato").max(MAX_CLASSIFICA_FORNITORI, `Massimo ${MAX_CLASSIFICA_FORNITORI} fornitori per volta`);
/** Solo amministratore (imposta_marca_fornitori); null = nessuna marca. */
export const impostaMarcaInput = z.object({ ids: idsSelezione, marca: z.string().trim().min(1).max(60).nullable() });
/** Solo amministratore e solo fornitori di servizi (imposta_sottocategoria_fornitori); null = togli. */
export const impostaSottocategoriaInput = z.object({ ids: idsSelezione, codice: z.string().trim().min(1).max(60).nullable() });
export const opzioniFornitoriSchema = z.object({
  marche: z.array(z.object({ codice: z.string(), descrizione: z.string().nullable() })),
  sottocategorie: z.array(z.object({ codice: z.string(), descrizione: z.string() })),
});
export type OpzioniFornitori = z.infer<typeof opzioniFornitoriSchema>;
export const classificaFornitoriInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Nessun fornitore selezionato").max(MAX_CLASSIFICA_FORNITORI, `Massimo ${MAX_CLASSIFICA_FORNITORI} fornitori per volta`),
  tipo: z.enum(["merci", "servizi"]),
});

/** FM62: colonne ordinabili dell'elenco fornitori (gemello SQL: whitelist in cerca_fornitori). */
export const ORDINAMENTI_FORNITORI = ["codice", "ragione_sociale", "citta", "partita_iva", "tipo", "marca", "sottocategoria", "email"] as const;
export type OrdinamentoFornitori = (typeof ORDINAMENTI_FORNITORI)[number];
export function ordinamentoFornitoriValido(ordina: string, direzione: string): { ordina: OrdinamentoFornitori; direzione: "asc" | "desc" } {
  return { ordina: (ORDINAMENTI_FORNITORI as readonly string[]).includes(ordina) ? ordina as OrdinamentoFornitori : "ragione_sociale", direzione: direzione === "desc" ? "desc" : "asc" };
}

const paginazione = {
  limite: z.number().int().min(1).max(200),
  offset: z.number().int().min(0).default(0),
};
export const elencoFornitoriInput = z.object({
  testo: z.string().trim().nullable().optional(),
  ancheCliente: z.boolean().nullable().optional(),
  conArticoli: z.boolean().nullable().optional(),
  includiManuali: z.boolean().default(false),
  macrocategorie: z.array(z.string().trim().min(1).max(20)).max(10).nullable().optional(),
  conEmail: z.boolean().nullable().optional(),
  /** FM62 F6: tipo effettivo (Gamma 01/03, altrimenti app). */
  tipi: z.array(z.enum(TIPI_FORNITORE)).max(3).nullable().optional(),
  /** FM62 F7: null = tutti. */
  statiConvenzione: z.array(z.enum(STATI_CONVENZIONE)).max(10).nullable().optional(),
  /** FM62: obsoleti (public.fornitore_obsoleto) esclusi salvo richiesta. */
  includiObsoleti: z.boolean().default(false),
  /** Codici marca; "__nessuna__" = senza marca. */
  marche: z.array(z.string().trim().min(1).max(60)).max(200).nullable().optional(),
  /** Codici sottocategoria servizi; "__nessuna__" = senza sottocategoria. */
  sottocategorie: z.array(z.string().trim().min(1).max(60)).max(50).nullable().optional(),
  /** FM62: ordinamento lato server (whitelist gemella del CASE in cerca_fornitori). */
  ordina: z.enum(ORDINAMENTI_FORNITORI).default("ragione_sociale"),
  direzione: z.enum(["asc", "desc"]).default("asc"),
  limite: paginazione.limite.default(100), offset: paginazione.offset,
});
/** Stessi filtri dell'elenco, senza paginazione né ordinamento: per "seleziona tutti i filtrati". */
export const idsFornitoriInput = elencoFornitoriInput.omit({ limite: true, offset: true, ordina: true, direzione: true });
export const dettaglioFornitoreInput = z.object({ id: z.string().uuid() });
export const articoliFornitoreInput = z.object({
  fornitoreId: z.string().uuid(), testo: z.string().trim().nullable().optional(),
  soloPreferenziali: z.boolean().default(false),
  limite: paginazione.limite.default(50), offset: paginazione.offset,
});
export const salvaNoteFornitoreInput = z.object({
  id: z.string().uuid(),
  note: z.string().refine((value) => Array.from(value).length <= 4000,
    "Le note interne possono contenere al massimo 4000 caratteri").nullable(),
});
export type FiltriFornitori = z.input<typeof elencoFornitoriInput>;
export type FiltriIdsFornitori = z.input<typeof idsFornitoriInput>;
export type FiltriArticoliFornitore = z.input<typeof articoliFornitoreInput>;
export type FornitoreElenco = Database["public"]["Functions"]["cerca_fornitori"]["Returns"][number];
export type ArticoloFornitore = Database["public"]["Functions"]["articoli_fornitore"]["Returns"][number];
const testo = z.string().nullable();
const numero = z.number().nullable();
const booleano = z.boolean().nullable();
export const dettaglioFornitoreSchema = z.object({
  id: z.string().uuid(), origine: z.string(), codice_gestionale: numero,
  codice_anagrafica_generale: numero, codice_cliente_gamma: numero,
  ragione_sociale: testo, alias: testo, partita_iva: testo, codice_fiscale: testo,
  indirizzo: testo, cap: testo, citta: testo, provincia: testo, stato: testo,
  telefono: testo, telefono_2: testo, cellulare: testo, fax: testo,
  email: testo, sito: testo, pec: testo, persona_fisica: booleano, valida: booleano,
  condizione_pagamento_cod: testo, condizione_pagamento_desc: testo,
  attivo: booleano, note: testo, macrocategoria_cod: testo, macrocategoria_desc: testo,
  tipo_effettivo: z.enum(TIPI_FORNITORE).catch("da_classificare"), tipo_fonte: z.enum(["gamma", "convenzionato", "app", "nessuna"]).catch("nessuna"), tipo_app_il: testo.optional(),
  stato_convenzione: z.enum(STATI_CONVENZIONE).catch("non_convenzionato"), stato_convenzione_fonte: z.enum(["app", "gamma"]).nullable().catch(null),
  stato_convenzione_il: testo.optional(), stato_convenzione_da_nome: testo.optional(), tipo_conflitto_convenzione: z.boolean().nullable().optional(),
  puo_cambiare_convenzione: z.boolean().catch(false),
  obsoleto: z.boolean().catch(false),
  marca_codice: testo.catch(null), marca_descrizione: testo.catch(null), marca_fonte: z.enum(["automatica", "manuale"]).nullable().catch(null), marca_il: testo.optional(),
  sottocategoria_codice: testo.catch(null), sottocategoria_descrizione: testo.catch(null), sottocategoria_fonte: z.enum(["gamma", "app"]).nullable().catch(null),
  ultima_modifica_gamma: testo, ultima_sincronizzazione: testo,
  clienti: z.array(z.object({
    cliente_id: z.string().uuid(), codice_gestionale: testo, ragione_sociale: testo,
    store_nome: testo, bloccato: booleano, in_gestione_legale: booleano,
    origine_legame: z.string(), coincide_su: testo,
  })),
  n_articoli: z.number().int(), n_preferenziale: z.number().int(), puo_modificare_note: z.boolean(), puo_vedere_articoli: z.boolean(),
});
export type DettaglioFornitore = z.infer<typeof dettaglioFornitoreSchema>;