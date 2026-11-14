import type { Database } from "@/integrations/supabase/types";

/** Identità commerciale del documento, separata dalla riserva sede delle giacenze. */
export type CondizioniPrezziPreventivo = Pick<Database["public"]["Tables"]["preventivi"]["Row"],
  "cliente_id" | "listino_rif" | "macrocategoria_rif" | "categoria_rif" | "store_id"> & { data?: string | null };
export type PrezzoPreventivoGamma = Database["public"]["Functions"]["prezzi_preventivo_cliente"]["Returns"][number];
type ParametriCliente = Database["public"]["Functions"]["prezzi_preventivo_cliente"]["Args"];
// I tipi generati non descrivono i NULL ammessi dalla firma SQL (nessun fallback commerciale).
type ParametriRiferimento = Omit<Database["public"]["Functions"]["prezzi_preventivo_riferimento"]["Args"], "_store_id" | "_macrocategoria" | "_categoria"> & {
  _store_id: string | null; _macrocategoria: string | null; _categoria: string | null;
};
export interface ClientPrezziPreventivo {
  rpc(nome: "prezzi_preventivo_cliente", parametri: ParametriCliente): PromiseLike<{ data: PrezzoPreventivoGamma[] | null; error: unknown }>;
  rpc(nome: "prezzi_preventivo_riferimento", parametri: ParametriRiferimento): PromiseLike<{ data: PrezzoPreventivoGamma[] | null; error: unknown }>;
}

/** Unico dispatcher delle RPC prezzi: non calcola né modifica prezzi o provenienza della riga. */
export async function fetchPrezziPreventivo(
  preventivo: CondizioniPrezziPreventivo, codici: string[], client?: ClientPrezziPreventivo,
): Promise<Map<string, PrezzoPreventivoGamma>> {
  const unici = [...new Set(codici.filter(Boolean))];
  const out = new Map<string, PrezzoPreventivoGamma>();
  if (!unici.length || (preventivo.listino_rif == null && !preventivo.cliente_id)) return out;
  const db = client ?? (await import("@/integrations/supabase/client")).supabase as unknown as ClientPrezziPreventivo;
  const dataPrezzi = preventivo.data ? { _data: preventivo.data } : {};
  const risposta = preventivo.listino_rif != null
    ? await db.rpc("prezzi_preventivo_riferimento", {
      _listino: preventivo.listino_rif, _macrocategoria: preventivo.macrocategoria_rif,
      _categoria: preventivo.categoria_rif, _store_id: preventivo.store_id, _codici: unici, ...dataPrezzi,
    })
    : preventivo.cliente_id ? await db.rpc("prezzi_preventivo_cliente", {
      _cliente_id: preventivo.cliente_id, _codici: unici, ...dataPrezzi,
    }) : null;
  if (risposta?.error) throw risposta.error;
  for (const r of risposta?.data ?? []) out.set(r.articolo_codice, r);
  return out;
}

export async function fetchPrezzoPreventivoArticolo(preventivo: CondizioniPrezziPreventivo, codice: string) {
  return (await fetchPrezziPreventivo(preventivo, [codice])).get(codice) ?? null;
}

/** Contesto per schede cantiere esterne al documento e riepilogo cliente (comportamento esistente). */
export function condizioniPrezziCliente(cliente_id: string | null): CondizioniPrezziPreventivo {
  return { cliente_id, listino_rif: null, macrocategoria_rif: null, categoria_rif: null, store_id: null };
}