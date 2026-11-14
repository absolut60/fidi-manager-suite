import type { Database } from "@/integrations/supabase/types";

export type RiferimentoPreventivo = Pick<Database["public"]["Tables"]["preventivi"]["Row"], "listino_rif" | "macrocategoria_rif" | "categoria_rif">;
export type CataloghiRiferimento = {
  listini: { codice: number; descrizione: string }[];
  macrocategorie: { codice: string; label: string }[];
  categorie: { codice: string; label: string }[];
};

/** Ogni scrittura comprende tutte le condizioni; una scelta incompleta non si salva. */
export function campiRiferimentoPreventivo(attivo: boolean, valori: RiferimentoPreventivo): RiferimentoPreventivo | null {
  if (!attivo) return { listino_rif: null, macrocategoria_rif: null, categoria_rif: null };
  if (valori.listino_rif == null || !valori.macrocategoria_rif?.trim() || !valori.categoria_rif?.trim()) return null;
  return { listino_rif: valori.listino_rif, macrocategoria_rif: valori.macrocategoria_rif, categoria_rif: valori.categoria_rif || null };
}

export function testoRiferimentoPreventivo(valori: RiferimentoPreventivo, cataloghi?: CataloghiRiferimento): string | null {
  if (valori.listino_rif == null) return null;
  const macro = cataloghi?.macrocategorie.find(c => c.codice === valori.macrocategoria_rif)?.label ?? valori.macrocategoria_rif;
  const categoria = cataloghi?.categorie.find(c => c.codice === valori.categoria_rif)?.label ?? valori.categoria_rif;
  return `Riferimento: Listino ${valori.listino_rif}${macro ? ` · ${macro}` : ""}${categoria ? ` Categoria ${categoria}` : ""}`;
}

export const opzioniCataloghiRiferimento = {
  queryKey: ["cataloghi-condizioni-riferimento"],
  staleTime: 60_000,
  retry: false,
  queryFn: async (): Promise<CataloghiRiferimento> => {
    const { supabase } = await import("@/integrations/supabase/client");
    const risultati = await Promise.all([
      supabase.from("listini_gamma").select("codice,descrizione").order("codice"),
      supabase.from("macrocategorie").select("codice,label").order("label"),
      supabase.from("categorie_cliente").select("codice,label").order("label"),
    ]);
    for (const [i, r] of risultati.entries()) {
      if (r.error) throw new Error(`Lettura ${["listini", "macrocategorie", "categorie"][i]} non disponibile: ${r.error.message}`);
    }
    return { listini: risultati[0].data ?? [], macrocategorie: risultati[1].data ?? [], categorie: risultati[2].data ?? [] };
  },
};