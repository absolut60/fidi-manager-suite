// Raggruppamento puro degli avvisi periodici a negozi e agenti (FM60).
// Il job a orario fisso crea al massimo una email e una notifica per negozio.

export type RigaAvvisoNegozio = {
  store_id: string | null;
  negozio: string | null;
};

export type GruppoAvvisoNegozio<V extends RigaAvvisoNegozio, A extends RigaAvvisoNegozio> = {
  negozio: string;
  variazioni: V[];
  alertFidi: A[];
};

/** Un solo gruppo per negozio; righe senza negozio e giri senza novità non producono avvisi. */
export function raggruppaAvvisiPerNegozio<V extends RigaAvvisoNegozio, A extends RigaAvvisoNegozio>(
  variazioni: V[],
  alertFidi: A[],
): Map<string, GruppoAvvisoNegozio<V, A>> {
  const out = new Map<string, GruppoAvvisoNegozio<V, A>>();
  const gruppo = (riga: RigaAvvisoNegozio): GruppoAvvisoNegozio<V, A> | null => {
    if (!riga.store_id) return null;
    const esistente = out.get(riga.store_id);
    if (esistente) return esistente;
    const nuovo = { negozio: riga.negozio ?? "sede", variazioni: [], alertFidi: [] } as GruppoAvvisoNegozio<V, A>;
    out.set(riga.store_id, nuovo);
    return nuovo;
  };
  for (const riga of variazioni) gruppo(riga)?.variazioni.push(riga);
  for (const riga of alertFidi) gruppo(riga)?.alertFidi.push(riga);
  return out;
}

export function messaggioConteggi(n: number, m: number, l = 0, u = 0, a = 0): string {
  const parti: string[] = [];
  if (n > 0) parti.push(`${n} ${n === 1 ? "bloccato" : "bloccati"}`);
  if (m > 0) parti.push(`${m} ${m === 1 ? "sbloccato" : "sbloccati"}`);
  if (l > 0) parti.push(`${l} in legale`);
  if (u > 0) parti.push(`${u} ${u === 1 ? "uscito" : "usciti"} dal legale`);
  if (a > 0) parti.push(`${a} alert fidi`);
  return parti.join(", ");
}
