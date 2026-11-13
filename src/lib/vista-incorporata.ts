import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

export const VISTA_INCORPORATA = "incorporata";
/** Validazione unica, ereditata dalle pagine del layout _app; non modifica l'accesso. */
export const vistaSearchSchema = z.object({ vista: fallback(z.string().optional(), undefined) });
export function vistaIncorporata(search: { vista?: unknown }) {
  return search.vista === VISTA_INCORPORATA;
}
export function urlClienteIncorporato(id: string) {
  return `/clienti/${encodeURIComponent(id)}?vista=${VISTA_INCORPORATA}`;
}
/** Solo altre pagine della stessa app; tab, ancore, allegati e tel/mail restano invariati. */
export function destinazioneFuoriFinestra(href: string, pagina: string): string | null {
  const corrente = new URL(pagina);
  const link = new URL(href, corrente);
  if (link.origin !== corrente.origin || link.pathname === corrente.pathname) return null;
  if (!/^https?:$/.test(link.protocol)) return null;
  link.searchParams.delete("vista");
  return link.href;
}