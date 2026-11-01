// FM55 — Sezione "Alert fidi" dell'email unica per negozio (modulo puro, nessun import di supabase).
// Il testo del consumo è il gemello TS di quello scritto da public.invia_notifiche_alert_fidi.

export type AlertEmail = {
  id: string;
  store_id: string | null;
  negozio: string | null;
  codice: string | null;
  ragione_sociale: string | null;
  tipo: string;
  consumo: number | null;
  esposizione: number | null;
  ordini_aperti: number | null;
  fido_gamma: number | null;
  fido_proposto: number | null;
  /** Etichette dei motivi (etichetteRigaProposta), già in ordine di priorità. */
  motivi: string[];
};

/** Euro arrotondati in formato italiano, come to_char + translate in SQL (es. 2.608 €). */
export function euroAvviso(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "-" : ""}${s} €`;
}

/** "Ci deve il 87% del fido: 2.608 € su 3.000 €. Fido teorico 0 €." (+ " Ordini in arrivo 121 €."). */
export function messaggioConsumoAlert(a: Pick<AlertEmail, "consumo" | "esposizione" | "fido_gamma" | "fido_proposto" | "ordini_aperti">): string {
  let m = `Ci deve il ${Math.round(Number(a.consumo ?? 0) * 100)}% del fido: ${euroAvviso(a.esposizione)} su ${euroAvviso(a.fido_gamma)}. Fido teorico ${euroAvviso(a.fido_proposto)}.`;
  if (Math.round(Number(a.ordini_aperti ?? 0)) > 0) m += ` Ordini in arrivo ${euroAvviso(a.ordini_aperti)}.`;
  return m;
}

/** Raggruppa per negozio; gli alert senza negozio non vanno in email. */
export function alertPerNegozio(alerts: AlertEmail[]): Map<string, AlertEmail[]> {
  const out = new Map<string, AlertEmail[]>();
  for (const a of alerts) {
    if (!a.store_id) continue;
    const arr = out.get(a.store_id) ?? [];
    arr.push(a);
    out.set(a.store_id, arr);
  }
  return out;
}

export function etichettaTipoAlert(tipo: string): string {
  if (tipo === "riduzione") return "Fido più alto del necessario";
  if (tipo === "extra_non_usato") return "Extra non usato";
  return "Vicino al limite";
}
