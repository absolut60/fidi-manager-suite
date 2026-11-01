/**
 * Card "Privati (senza partita IVA)" e "POS / contanti con fido" della Dashboard Fidi.
 * Gemello TS di public.get_dashboard_fidi_giro / get_clienti_giro_fidi_ids (stessi criteri).
 * Privati: senza partita IVA, Sede Centrale esclusa (ha la sua logica).
 */
import { isSedeCentraleFido, isSenzaPartitaIvaFido } from "@/lib/fido-teorico";

export type ClienteGiro = {
  partita_iva?: string | null;
  store_id?: string | null;
  fido_gestionale?: number | null;
  totale_rischio?: number | null;
  fido_proposto?: number | null;
  regola_applicata?: string | null;
};

export const REGOLA_PAGAMENTO_IMMEDIATO = "pagamento_immediato";

export function isPrivatoCard(c: ClienteGiro): boolean {
  return isSenzaPartitaIvaFido(c) && !isSedeCentraleFido(c);
}

export function riepilogoPrivati(clienti: ClienteGiro[]) {
  const privati = clienti.filter(isPrivatoCard);
  const conFido = privati.filter((c) => (c.fido_gestionale ?? 0) > 0);
  return {
    conFidoN: conFido.length,
    concesso: conFido.reduce((s, c) => s + (c.fido_gestionale ?? 0), 0),
    proposto: privati.reduce((s, c) => s + (c.fido_proposto ?? 0), 0),
    esposizione: privati.reduce((s, c) => s + Math.max(c.totale_rischio ?? 0, 0), 0),
  };
}

export function riepilogoPosConFido(clienti: ClienteGiro[]) {
  const pos = clienti.filter((c) => c.regola_applicata === REGOLA_PAGAMENTO_IMMEDIATO && (c.fido_gestionale ?? 0) > 0);
  return { n: pos.length, concesso: pos.reduce((s, c) => s + (c.fido_gestionale ?? 0), 0) };
}

/** "X% del fido concesso totale", una cifra decimale in formato italiano. */
export function percentualeSuTotale(parte: number, totale: number): string {
  const p = totale > 0 ? (parte / totale) * 100 : 0;
  return `${p.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
