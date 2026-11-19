/** FM86: proposta sede unica; una scelta esplicita del documento resta modificabile. */
export function risolviSedePreventivo({ cliente, lead, utente }: {
  cliente?: { store_id: string | null } | null;
  lead?: { store_id: string | null } | null;
  utente?: { store_id: string | null } | null;
}): string | null {
  return cliente?.store_id ?? lead?.store_id ?? utente?.store_id ?? null;
}

/** FM70: identità sede scritta sempre insieme al nome della filiale. */
export function campiSedePreventivo(sede: { id: string | null; nome: string | null } | null) {
  return { filiale: sede?.nome ?? null, store_id: sede?.id ?? null };
}

/** FM70 3c: riserva solo di lettura per le giacenze, mai campi da salvare. */
export function sedeGiacenzePreventivo(
  preventivo: { store_id: string | null; filiale: string | null },
  cliente: { store_id: string | null; sede_nome: string | null } | null | undefined,
) {
  return preventivo.store_id
    ? { sedeGiacenzaId: preventivo.store_id, sedeNome: preventivo.filiale }
    : { sedeGiacenzaId: cliente?.store_id ?? null, sedeNome: cliente?.store_id ? cliente.sede_nome : null };
}

/** FM65 R1a: gemella di public.lettera_preventivo, con elenco completo dei fratelli. */
export function letteraPreventivo(documento: { id: string; alternativa_di: string | null }, alternative: readonly { id: string; created_at: string }[]): string {
  if (!documento.alternativa_di) return "A";
  const ordinate = [...alternative].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  const posizione = ordinate.findIndex((a) => a.id === documento.id);
  if (posizione < 0) throw new Error("Alternativa assente dall’elenco completo");
  let n = posizione + 2;
  let lettera = "";
  while (n > 0) {
    n -= 1;
    lettera = String.fromCharCode(65 + n % 26) + lettera;
    n = Math.floor(n / 26);
  }
  return lettera;
}

/** FM65 Punto 5: lettere per l'elenco; raggruppa per alternativa_di e riusa letteraPreventivo. */
export function lettereElenco(righe: readonly { id: string; alternativa_di: string | null; created_at: string }[]): Map<string, string> {
  const gruppi = new Map<string, { id: string; created_at: string }[]>();
  for (const r of righe) {
    if (!r.alternativa_di) continue;
    const g = gruppi.get(r.alternativa_di) ?? [];
    g.push(r);
    gruppi.set(r.alternativa_di, g);
  }
  const esito = new Map<string, string>();
  for (const r of righe) {
    esito.set(r.id, letteraPreventivo(r, r.alternativa_di ? (gruppi.get(r.alternativa_di) ?? []) : []));
  }
  return esito;
}

/** Date ISO, somma di giorni di calendario indipendente da DST/fuso del browser. */
export function validitaProposta(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "";
  const giorno = new Date(`${data}T12:00:00Z`);
  if (!Number.isFinite(giorno.getTime())) return "";
  giorno.setUTCDate(giorno.getUTCDate() + 7);
  return giorno.toISOString().slice(0, 10);
}

export function riallineaValidita(data: string, validita: string, modificataAMano: boolean): string {
  return modificataAMano ? validita : validitaProposta(data);
}
