import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/** FM62 F6: valori di public.tipo_fornitore_effettivo. */
export const TIPI_FORNITORE = ["merci", "servizi", "da_classificare"] as const;
export type TipoFornitore = typeof TIPI_FORNITORE[number];
export const MAX_CLASSIFICA_FORNITORI = 5000;
export const classificaFornitoriInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Nessun fornitore selezionato").max(MAX_CLASSIFICA_FORNITORI, `Massimo ${MAX_CLASSIFICA_FORNITORI} fornitori per volta`),
  tipo: z.enum(["merci", "servizi"]),
});

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
  limite: paginazione.limite.default(100), offset: paginazione.offset,
});
/** Stessi filtri dell'elenco, senza paginazione: per "seleziona tutti i filtrati". */
export const idsFornitoriInput = elencoFornitoriInput.omit({ limite: true, offset: true });
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
  tipo_effettivo: z.enum(TIPI_FORNITORE).catch("da_classificare"), tipo_fonte: z.enum(["gamma", "app", "nessuna"]).catch("nessuna"), tipo_app_il: testo.optional(),
  ultima_modifica_gamma: testo, ultima_sincronizzazione: testo,
  clienti: z.array(z.object({
    cliente_id: z.string().uuid(), codice_gestionale: testo, ragione_sociale: testo,
    store_nome: testo, bloccato: booleano, in_gestione_legale: booleano,
    origine_legame: z.string(), coincide_su: testo,
  })),
  n_articoli: z.number().int(), n_preferenziale: z.number().int(), puo_modificare_note: z.boolean(), puo_vedere_articoli: z.boolean(),
});
export type DettaglioFornitore = z.infer<typeof dettaglioFornitoreSchema>;