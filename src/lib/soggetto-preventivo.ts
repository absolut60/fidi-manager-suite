import type { Database } from "@/integrations/supabase/types";
import { campiRiferimentoPreventivo, type RiferimentoPreventivo } from "./condizioni-riferimento";
import { scritturaPreventiviVincolataAgente } from './permessi-preventivi';

export type LeadPreventivo = Pick<Database["public"]["Tables"]["lead"]["Row"],
  "id" | "ragione_sociale" | "nome" | "cognome" | "telefono" | "email" | "store_id" | "agente_codice" | "condizione_pagamento_cod" | "listino_rif" | "macrocategoria_rif" | "categoria_rif"> & { sede?: { nome: string } | null };
export type SoggettoPreventivo = { tipo: "cliente"; id: string } | { tipo: "lead"; id: string; lead: LeadPreventivo };
export const riferimentoVuoto: RiferimentoPreventivo = { listino_rif: null, macrocategoria_rif: null, categoria_rif: null };
/** Stessi valori iniziali per lead preassegnato, cercato o appena creato. */
export function condizioniDaLeadPreventivo(lead: LeadPreventivo, roles: readonly string[], codiceAgente: string | null | undefined) {
  return {
    riferimento: { listino_rif: lead.listino_rif, macrocategoria_rif: lead.macrocategoria_rif, categoria_rif: lead.categoria_rif },
    pagamento: lead.condizione_pagamento_cod ?? "",
    agente: scritturaPreventiviVincolataAgente(roles) ? codiceAgente ?? null
      : lead.agente_codice ?? (roles.includes("agente") ? codiceAgente ?? null : null),
  };
}
export function nomeLeadPreventivo(lead: Pick<LeadPreventivo, "ragione_sociale" | "nome" | "cognome"> | null | undefined) {
  return lead?.ragione_sociale || [lead?.nome, lead?.cognome].filter(Boolean).join(" ") || "Lead";
}
/** Nome dell'intestatario nei PDF: cliente se presente, altrimenti lead, altrimenti "—". */
export function nomeIntestatarioPdf(prev: { cliente?: { ragione_sociale: string | null } | null; lead?: Pick<LeadPreventivo, "ragione_sociale" | "nome" | "cognome"> | null }) {
  if (prev.cliente) return prev.cliente.ragione_sociale ?? "—";
  return prev.lead ? nomeLeadPreventivo(prev.lead) : "—";
}
/** Nome file dei documenti del preventivo: slug del cliente o del lead, "cliente" se manca il soggetto. */
export function nomeFileDocumentoPreventivo(prev: Parameters<typeof nomeIntestatarioPdf>[0] & { numero?: string | null }, tipo: string, ext = "pdf") {
  const num = (prev.numero ?? "senza-numero").replace(/[^A-Za-z0-9_-]+/g, "_");
  const nome = nomeIntestatarioPdf(prev);
  const sog = (nome === "—" ? "cliente" : nome).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 30);
  return `${tipo}_${num}_${sog}.${ext}`;
}
/** Un'unica scrittura esclude sempre l'altro destinatario; il riferimento è obbligatorio per lead. */
export function campiSoggettoPreventivo(soggetto: SoggettoPreventivo, riferimento: RiferimentoPreventivo) {
  if (soggetto.tipo === "cliente") return { cliente_id: soggetto.id, lead_id: null };
  const condizioni = campiRiferimentoPreventivo(true, riferimento);
  if (!condizioni) throw new Error("Listino, macrocategoria e categoria obbligatori per il lead");
  return { cliente_id: null, lead_id: soggetto.id, ...condizioni };
}