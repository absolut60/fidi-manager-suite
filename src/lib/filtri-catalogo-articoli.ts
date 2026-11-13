/**
 * FM65 F2 — FONTE UNICA della logica dei filtri a cascata famiglia → sottofamiglia → marca
 * (catalogo articoli F3, ricerca articolo del preventivo F4). Funzioni pure, nessun import server.
 * Terne da public.terne_articoli_filtri (lettore terneArticoliFiltri, formato compatto).
 * "__none__" = valore assente (regola filtri multipli FM53, VALORE_NESSUNO).
 */
import { VALORE_NESSUNO } from "./filtro-elenco";

export type TernaArticoliFiltri = {
  codice_famiglia: string | null; famiglia: string | null;
  codice_sottofamiglia: string | null; sottofamiglia: string | null;
  marca_codice: string | null; marca: string | null; conteggio: number;
};
/** Formato compatto in transito: dizionari [codice, nome] senza ripetizioni + righe di indici [famiglia, sottofamiglia, marca, conteggio]. */
export type TerneCompatte = {
  famiglie: [string | null, string | null][];
  sottofamiglie: [string | null, string | null][];
  marche: [string | null, string | null][];
  righe: [number, number, number, number][];
};
export type ScelteCascata = { famiglie: string[]; coppie: string[]; marche: string[] };
export type OpzioneCascata = { valore: string; etichetta: string; conteggio: number };
export type OpzioniCascata = { famiglie: OpzioneCascata[]; sottofamiglie: OpzioneCascata[]; marche: OpzioneCascata[] };

export function compattaTerne(terne: TernaArticoliFiltri[]): TerneCompatte {
  const out: TerneCompatte = { famiglie: [], sottofamiglie: [], marche: [], righe: [] };
  const idx = (dict: [string | null, string | null][], mappa: Map<string, number>, c: string | null, n: string | null) => {
    const k = JSON.stringify([c, n]);
    let i = mappa.get(k);
    if (i === undefined) { i = dict.length; dict.push([c, n]); mappa.set(k, i); }
    return i;
  };
  const mf = new Map<string, number>(), ms = new Map<string, number>(), mm = new Map<string, number>();
  for (const t of terne) out.righe.push([
    idx(out.famiglie, mf, t.codice_famiglia, t.famiglia),
    idx(out.sottofamiglie, ms, t.codice_sottofamiglia, t.sottofamiglia),
    idx(out.marche, mm, t.marca_codice, t.marca), t.conteggio]);
  return out;
}
export function espandiTerne(c: TerneCompatte): TernaArticoliFiltri[] {
  return c.righe.map(([f, s, m, n]) => ({
    codice_famiglia: c.famiglie[f][0], famiglia: c.famiglie[f][1],
    codice_sottofamiglia: c.sottofamiglie[s][0], sottofamiglia: c.sottofamiglie[s][1],
    marca_codice: c.marche[m][0], marca: c.marche[m][1], conteggio: n }));
}

const chiave = (c: string | null) => c ?? VALORE_NESSUNO;
const chiaveCoppia = (t: TernaArticoliFiltri) => `${chiave(t.codice_famiglia)}|${chiave(t.codice_sottofamiglia)}`;
const perNome = (a: OpzioneCascata, b: OpzioneCascata) => a.etichetta.localeCompare(b.etichetta, "it-IT") || a.valore.localeCompare(b.valore);
function somma(terne: TernaArticoliFiltri[], k: (t: TernaArticoliFiltri) => string, nome: (t: TernaArticoliFiltri) => string) {
  const m = new Map<string, OpzioneCascata>();
  for (const t of terne) {
    const v = k(t), o = m.get(v);
    if (o) o.conteggio += t.conteggio; else m.set(v, { valore: v, etichetta: nome(t), conteggio: t.conteggio });
  }
  return [...m.values()];
}

export function opzioniCascata(terne: TernaArticoliFiltri[], scelte: ScelteCascata): OpzioniCascata {
  const famiglie = somma(terne, t => chiave(t.codice_famiglia),
    t => t.codice_famiglia === null ? "Senza famiglia" : (t.famiglia || t.codice_famiglia)).sort(perNome);
  const fam = new Set(scelte.famiglie);
  const diFamiglia = fam.size ? terne.filter(t => fam.has(chiave(t.codice_famiglia))) : terne;
  const sottofamiglie = somma(diFamiglia, chiaveCoppia,
    t => t.codice_sottofamiglia === null ? "Senza sottofamiglia" : (t.sottofamiglia || t.codice_sottofamiglia));
  // Stesso nome in famiglie diverse (es. due "Senza sottofamiglia"): famiglia tra parentesi.
  const nomeFam = new Map(famiglie.map(f => [f.valore, f.etichetta]));
  const ripetuti = new Map<string, number>();
  for (const s of sottofamiglie) ripetuti.set(s.etichetta, (ripetuti.get(s.etichetta) ?? 0) + 1);
  for (const s of sottofamiglie) if ((ripetuti.get(s.etichetta) ?? 0) > 1)
    s.etichetta = `${s.etichetta} (${nomeFam.get(s.valore.split("|")[0]) ?? s.valore.split("|")[0]})`;
  sottofamiglie.sort(perNome);
  // Come cerca_articoli: famiglie AND coppie.
  const cop = new Set(scelte.coppie);
  const perMarche = cop.size ? diFamiglia.filter(t => cop.has(chiaveCoppia(t))) : diFamiglia;
  const marche = somma(perMarche, t => chiave(t.marca_codice),
    t => t.marca_codice === null ? "Senza marca" : (t.marca || t.marca_codice)).sort(perNome);
  return { famiglie, sottofamiglie, marche };
}

/** Toglie a valle le scelte non più valide (cambio famiglia → coppie e marche inesistenti). */
export function puliziaScelte(terne: TernaArticoliFiltri[], scelte: ScelteCascata): ScelteCascata {
  const base = opzioniCascata(terne, { famiglie: scelte.famiglie, coppie: [], marche: [] });
  const famiglie = scelte.famiglie.filter(v => base.famiglie.some(o => o.valore === v));
  const okCop = new Set(opzioniCascata(terne, { famiglie, coppie: [], marche: [] }).sottofamiglie.map(o => o.valore));
  const coppie = scelte.coppie.filter(v => okCop.has(v));
  const okMar = new Set(opzioniCascata(terne, { famiglie, coppie, marche: [] }).marche.map(o => o.valore));
  return { famiglie, coppie, marche: scelte.marche.filter(v => okMar.has(v)) };
}

/**
 * Parametri per cerca_articoli (mai il vecchio `sottofamiglie`). Coppie: "__none__" → "" perché SQL confronta
 * coalesce(codice,'')||'|'||coalesce(codice,''). Famiglie/marche "__none__" passano invariate:
 * cerca_articoli (FM65 F3) le interpreta come codice NULL, in OR con gli altri valori.
 */
export function parametriRicerca(scelte: ScelteCascata) {
  return {
    famiglie: [...scelte.famiglie],
    coppie: scelte.coppie.map(c => c.split("|").map(p => (p === VALORE_NESSUNO ? "" : p)).join("|")),
    marche: [...scelte.marche],
  };
}

/**
 * Filtri salvati prima di F3: codici sottofamiglia senza famiglia. Ogni codice diventa la sua coppia 'FAM|SOT'
 * solo se univoco (fra le famiglie scelte, se ce ne sono); se ambiguo o inesistente viene scartato.
 */
export function convertiSottofamiglieSalvate(terne: TernaArticoliFiltri[], codici: string[], famiglie: string[]): string[] {
  const fam = new Set(famiglie);
  const out: string[] = [];
  for (const cod of codici) {
    const coppie = new Set(terne.filter(t => chiave(t.codice_sottofamiglia) === cod && (!fam.size || fam.has(chiave(t.codice_famiglia)))).map(chiaveCoppia));
    if (coppie.size === 1) out.push([...coppie][0]);
  }
  return [...new Set(out)];
}
