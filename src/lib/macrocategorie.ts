export const MACROCATEGORIE = [
  { codice: "01", label: "IMPRESE EDILI" },
  { codice: "02", label: "PRIVATI" },
  { codice: "03", label: "DIPENDENTI" },
  { codice: "04", label: "AZIENDA" },
  { codice: "N/D", label: "Altre macrocategorie" },
] as const;

export const CATEGORIE = [
  { codice: "01", label: "IMPRESE Categoria A" },
  { codice: "02", label: "IMPRESE Categoria B" },
  { codice: "03", label: "IMPRESE Categoria C" },
  { codice: "N/D", label: "Altre categorie" },
] as const;

export type Macrocategoria = (typeof MACROCATEGORIE)[number];
export type Categoria = (typeof CATEGORIE)[number];

export function findMacrocategoria(codice: string) {
  if (!codice) return undefined;
  return MACROCATEGORIE.find((m) => m.codice === codice);
}

export function findCategoria(codice: string) {
  if (!codice) return undefined;
  return CATEGORIE.find((c) => c.codice === codice);
}
