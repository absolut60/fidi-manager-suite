import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const paginazione = {
  limite: z.number().int().min(1).max(200),
  offset: z.number().int().min(0).default(0),
};
export const elencoFornitoriInput = z.object({
  testo: z.string().trim().nullable().optional(),
  ancheCliente: z.boolean().nullable().optional(),
  conArticoli: z.boolean().nullable().optional(),
  includiManuali: z.boolean().default(false),
  limite: paginazione.limite.default(100), offset: paginazione.offset,
});
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
  attivo: booleano, note: testo, ultima_modifica_gamma: testo, ultima_sincronizzazione: testo,
  clienti: z.array(z.object({
    cliente_id: z.string().uuid(), codice_gestionale: testo, ragione_sociale: testo,
    store_nome: testo, bloccato: booleano, in_gestione_legale: booleano,
    origine_legame: z.string(), coincide_su: testo,
  })),
  n_articoli: z.number().int(), n_preferenziale: z.number().int(), puo_modificare_note: z.boolean(),
});
export type DettaglioFornitore = z.infer<typeof dettaglioFornitoreSchema>;