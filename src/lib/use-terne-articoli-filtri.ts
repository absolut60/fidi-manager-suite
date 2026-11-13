import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { terneArticoliFiltri } from "./catalogo-articoli.functions";
import { espandiTerne } from "./filtri-catalogo-articoli";

/** FM65 F2: terne dei filtri a cascata, scaricate una volta per sessione. */
export function useTerneArticoliFiltri() {
  const leggi = useServerFn(terneArticoliFiltri);
  return useQuery({
    queryKey: ["terne-articoli-filtri"],
    queryFn: async () => espandiTerne(await leggi()),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
}
