import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { campiRiferimentoPreventivo, type RiferimentoPreventivo } from "./condizioni-riferimento";

export type LeadPreventivo = Pick<Database["public"]["Tables"]["lead"]["Row"],
  "id" | "ragione_sociale" | "nome" | "cognome" | "telefono" | "email" | "store_id" | "agente_codice" | "condizione_pagamento_cod" | "listino_rif" | "macrocategoria_rif" | "categoria_rif"> & { sede?: { nome: string } | null };
export type SoggettoPreventivo = { tipo: "cliente"; id: string } | { tipo: "lead"; id: string; lead: LeadPreventivo };
export const riferimentoVuoto: RiferimentoPreventivo = { listino_rif: null, macrocategoria_rif: null, categoria_rif: null };
export const inputLeadRapido = z.object({
  ragione_sociale: z.string().trim().max(250).default(""),
  nome: z.string().trim().max(100).default(""), cognome: z.string().trim().max(100).default(""),
  telefono: z.string().trim().max(50).default(""),
  email: z.union([z.string().trim().email("Email non valida").max(254), z.literal("")]).default(""),
  store_id: z.string().uuid().nullable(),
}).refine(v => !!v.ragione_sociale || !!v.nome || !!v.cognome, { message: "Inserisci ragione sociale oppure nome e cognome" });

export function nomeLeadPreventivo(lead: Pick<LeadPreventivo, "ragione_sociale" | "nome" | "cognome"> | null | undefined) {
  return lead?.ragione_sociale || [lead?.nome, lead?.cognome].filter(Boolean).join(" ") || "Lead";
}
export function campiLeadRapido(input: z.input<typeof inputLeadRapido>, agente: string | null) {
  const v = inputLeadRapido.parse(input);
  return { ...v, ragione_sociale: v.ragione_sociale || null, nome: v.nome || null, cognome: v.cognome || null,
    telefono: v.telefono || null, email: v.email || null, fonte: "manuale" as const,
    fonte_dettaglio: "preventivatore", agente_codice: agente };
}
/** Un'unica scrittura esclude sempre l'altro destinatario; il riferimento è obbligatorio per lead. */
export function campiSoggettoPreventivo(soggetto: SoggettoPreventivo, riferimento: RiferimentoPreventivo) {
  if (soggetto.tipo === "cliente") return { cliente_id: soggetto.id, lead_id: null };
  const condizioni = campiRiferimentoPreventivo(true, riferimento);
  if (!condizioni) throw new Error("Listino, macrocategoria e categoria obbligatori per il lead");
  return { cliente_id: null, lead_id: soggetto.id, ...condizioni };
}