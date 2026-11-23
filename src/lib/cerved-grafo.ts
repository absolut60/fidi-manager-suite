/**
 * FM100 fetta 2 — fonte unica del grafico dei collegati Cerved (puro: browser e server).
 * Riusa le funzioni di cerved-collegati (ruoli, stato società, abbinamento esponente↔società, eventi).
 * Regole: docs/regole/cerved-grafo-collegati.md, sezione "Grafico".
 */
import type { EsponenteCerved, LightReportCerved, SocietaCollegataCerved } from "./cerved/cerved.server";
import { eventiSoggettiCerved, nomeEsponenteCerved, raggruppaSocietaCerved, statoSocietaCerved, testoRuoloCerved } from "./cerved-collegati";
import { pivaCifre } from "./cerved/cerved-entita";
import { dataIsoIt } from "./cerved-presentazione";
import { formatEuro } from "./fidi";
import { getFidoAttuale } from "./fido-cliente";

export type TipoNodoGrafo = "centro" | "persona" | "societa" | "societa_estera" | "solo_nome";
export type StatoNodoGrafo = "attiva" | "cessata" | "procedura" | "non_indicato";
export type NodoGrafo = {
  id: string; tipo: TipoNodoGrafo; nome: string; codice_fiscale: string | null;
  stato: StatoNodoGrafo; stato_testo: string | null; eventi: string[]; livello: 0 | 1 | 2;
  dettagli: { etichetta: string; valore: string }[];
};
export type ArcoGrafo = { id: string; da: string; a: string; etichette: string[]; tipi: string[]; in_corso: boolean };
export type GrafoCerved = { nodi: NodoGrafo[]; archi: ArcoGrafo[] };
export type CentroGrafo = { nome: string | null; partita_iva: string | null; codice_fiscale: string | null };

/** Gemello della normalizzazione SQL di public.riconcilia_lead_clienti (FM99): P.IVA = sole cifre (pivaCifre). */
export const normalizzaCfGrafo = (cf: string | null | undefined) => String(cf ?? "").trim().toUpperCase();
/** Chiave fiscale valida come in riconcilia_lead_clienti: P.IVA 11 cifre ≠ 102730/102729, altrimenti CF di 11 o 16 caratteri. */
export function chiaveFiscaleValida(valore: string | null | undefined): string | null {
  const piva = pivaCifre(valore);
  if (/^\d{11}$/.test(piva) && piva !== "102730" && piva !== "102729") return piva;
  const cf = normalizzaCfGrafo(valore);
  return cf.length === 11 || cf.length === 16 ? cf : null;
}
const nomeNorm = (n: string | null | undefined) => String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const pct = (p: number | null) => (p == null ? null : `${p.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`);

type Famiglia = "persona" | "societa";
type Sorgente = { tipo: Exclude<TipoNodoGrafo, "centro">; nome: string | null; cf: string | null; idCerved?: string | null; subject?: string | null };

function statoDaSocieta(s: Pick<SocietaCollegataCerved, "stato_codice" | "stato_descrizione" | "stato_dal">): { stato: StatoNodoGrafo; testo: string } {
  const r = statoSocietaCerved(s);
  if (r.tono === "verde" || /^attiva$/i.test(s.stato_descrizione ?? "")) return { stato: "attiva", testo: r.testo };
  if (s.stato_codice === "T") return { stato: "cessata", testo: r.testo };
  if (r.tono === "rosso") return { stato: "procedura", testo: r.testo };
  return { stato: "non_indicato", testo: r.testo };
}

export function costruisciGrafoCerved(lr: Pick<LightReportCerved, "soci" | "titolari_effettivi" | "partecipazioni" | "esponenti" | "societa_collegate"> & { eventi_negativi?: Partial<LightReportCerved["eventi_negativi"]> | null }, centro: CentroGrafo): GrafoCerved {
  const nodi = new Map<string, NodoGrafo>();
  const alias = new Map<string, string>();
  const famigliaDi = new Map<string, Famiglia>();
  const CENTRO = "centro";
  nodi.set(CENTRO, { id: CENTRO, tipo: "centro", nome: centro.nome ?? "Azienda", codice_fiscale: centro.partita_iva ?? centro.codice_fiscale ?? null, stato: "non_indicato", stato_testo: null, eventi: [], livello: 0, dettagli: [] });
  const chiaviCentro = new Set([chiaveFiscaleValida(centro.partita_iva), chiaveFiscaleValida(centro.codice_fiscale)].filter((x): x is string => !!x));
  for (const k of chiaviCentro) alias.set(`societa:cf:${k}`, CENTRO);

  function nodo(s: Sorgente, livello: 1 | 2): string {
    const fam: Famiglia = s.tipo === "persona" ? "persona" : "societa";
    const cf = chiaveFiscaleValida(s.cf);
    const chiavi = [cf ? `${fam}:cf:${cf}` : null, s.idCerved ? `${fam}:id:${s.idCerved}` : null, s.subject ? `${fam}:sub:${s.subject}` : null].filter((x): x is string => !!x);
    if (s.tipo === "solo_nome") {
      const n = nomeNorm(s.nome);
      const id = alias.get(`persona:nome:${n}`) ?? alias.get(`solo:nome:${n}`);
      if (id) return id;
      chiavi.push(`solo:nome:${n}`);
    }
    if (!chiavi.length) chiavi.push(`${fam}:nome:${nomeNorm(s.nome)}`);
    let id = chiavi.map((c) => alias.get(c)).find(Boolean);
    if (!id) {
      id = chiavi[0]!;
      nodi.set(id, { id, tipo: s.tipo, nome: s.nome ?? "Senza nome", codice_fiscale: s.cf ? normalizzaCfGrafo(s.cf) : null, stato: "non_indicato", stato_testo: null, eventi: [], livello, dettagli: [] });
      famigliaDi.set(id, fam);
    } else {
      const n = nodi.get(id)!;
      if (id !== CENTRO && livello < n.livello) n.livello = livello;
      if (!n.codice_fiscale && s.cf) n.codice_fiscale = normalizzaCfGrafo(s.cf);
      if (n.tipo === "solo_nome" && s.tipo !== "solo_nome") n.tipo = s.tipo;
    }
    for (const c of chiavi) if (!alias.has(c)) alias.set(c, id);
    if (fam === "persona" && s.tipo === "persona") alias.set(`persona:nome:${nomeNorm(s.nome)}`, alias.get(`persona:nome:${nomeNorm(s.nome)}`) ?? id);
    return id;
  }
  const archi = new Map<string, ArcoGrafo>();
  function arco(da: string, a: string, tipo: string, etichetta: string, inCorso: boolean) {
    if (da === a) return;
    const k = [da, a].sort().join("|");
    let x = archi.get(k);
    if (!x) { x = { id: k, da, a, etichette: [], tipi: [], in_corso: false }; archi.set(k, x); }
    if (!x.etichette.includes(etichetta)) x.etichette.push(etichetta);
    if (!x.tipi.includes(tipo)) x.tipi.push(tipo);
    x.in_corso ||= inCorso;
  }
  const dettaglio = (id: string, etichetta: string, valore: string | null | undefined) => {
    const n = nodi.get(id)!;
    if (valore && !n.dettagli.some((d) => d.etichetta === etichetta)) n.dettagli.push({ etichetta, valore });
  };
  const importo = (v: { valore: number | null; data: string | null } | null | undefined) => (v?.valore == null ? null : `${formatEuro(v.valore)}${v.data ? ` (${v.data.slice(0, 4)})` : ""}`);
  const statoSoc = (id: string, s: Pick<SocietaCollegataCerved, "stato_codice" | "stato_descrizione" | "stato_dal">) => {
    const n = nodi.get(id)!;
    if (id === CENTRO || n.stato !== "non_indicato" || (!s.stato_codice && !s.stato_descrizione)) return;
    const r = statoDaSocieta(s); n.stato = r.stato; n.stato_testo = r.testo;
  };
  const eventoSocieta = (id: string, ev: boolean | null) => { if (ev === true && id !== CENTRO) aggiungiEventi(id, ["Eventi negativi segnalati da Cerved"]); };
  function aggiungiEventi(id: string, e: string[]) { const n = nodi.get(id)!; n.eventi = [...new Set([...n.eventi, ...e])]; }

  const idEsponenti = new Map<string, string>();
  // Soci principali in coda: si uniscono a una persona del report solo dopo che tutte le persone sono note.
  const sociPrincipali: { nome: string; verso: string }[] = [];
  for (const s of lr.soci ?? []) {
    const id = nodo({ tipo: s.tipo, nome: s.nome, cf: s.codice_fiscale, idCerved: s.id_cerved, subject: s.subject_id }, 1);
    const et = [pct(s.percentuale), s.diritto && s.diritto !== "PROPRIETA'" ? s.diritto : null].filter(Boolean).join(" ") || "Socio";
    arco(id, CENTRO, "socio", et, true);
    if (s.tipo !== "persona") { statoSoc(id, s); eventoSocieta(id, s.eventi_negativi); dettaglio(id, "Forma", s.forma); dettaglio(id, "Ateco", [s.ateco_codice, s.ateco_descrizione].filter(Boolean).join(" ") || null); dettaglio(id, "Gruppo", s.gruppo); dettaglio(id, "Nazionalità", s.nazionalita); }
    for (const p of s.soci_principali ?? []) sociPrincipali.push({ nome: p, verso: id });
  }
  for (const t of lr.titolari_effettivi ?? []) {
    const id = nodo({ tipo: t.persona === false ? "societa" : "persona", nome: t.nome, cf: t.codice_fiscale, subject: t.id_soggetto }, 1);
    const extra = t.criterio === "POSSESSO_QUOTE" ? (t.percentuale != null ? `quote ${pct(t.percentuale)}` : "quote") : t.criterio?.startsWith("POTERI_") ? "poteri di amministrazione" : null;
    arco(id, CENTRO, "titolare_effettivo", ["Titolare effettivo", extra].filter(Boolean).join(" — "), true);
  }
  for (const e of lr.esponenti ?? []) {
    const id = nodo({ tipo: "persona", nome: nomeEsponenteCerved(e), cf: e.codice_fiscale, idCerved: e.id_persona, subject: e.subject_id }, 1);
    if (e.id_persona) idEsponenti.set(e.id_persona, id);
    dettaglio(id, "Nascita", [e.data_nascita ? dataIsoIt(e.data_nascita) ?? e.data_nascita : null, e.luogo_nascita ? `${e.luogo_nascita}${e.provincia_nascita ? ` (${e.provincia_nascita})` : ""}` : null].filter(Boolean).join(" — ") || null);
    for (const r of e.ruoli) { const t = testoRuoloCerved(r); arco(id, CENTRO, "esponente", t.testo, t.inCorso); }
  }
  for (const g of raggruppaSocietaCerved(lr.societa_collegate ?? [], lr.esponenti ?? [])) {
    const s = g.societa;
    for (const l of g.legami) {
      const da = (l.esponente?.id_persona && idEsponenti.get(l.esponente.id_persona)) || CENTRO;
      const id = nodo({ tipo: "societa", nome: s.nome, cf: s.codice_fiscale, idCerved: s.id_societa }, da === CENTRO ? 1 : 2);
      const t = testoRuoloCerved(l.ruolo, s);
      arco(da, id, "societa_collegata", t.testo, t.inCorso);
      statoSoc(id, s); eventoSocieta(id, s.eventi_negativi);
      dettaglio(id, "Forma", s.forma_giuridica); dettaglio(id, "Ateco", [s.ateco_codice, s.ateco_descrizione].filter(Boolean).join(" ") || null);
      dettaglio(id, "Fatturato", importo(s.fatturato)); dettaglio(id, "Utile", importo(s.utile)); dettaglio(id, "Gruppo", s.gruppo);
    }
  }
  for (const p of lr.partecipazioni ?? []) {
    const id = nodo({ tipo: "societa", nome: p.nome, cf: p.codice_fiscale, idCerved: p.id_societa }, 1);
    arco(CENTRO, id, "partecipazione", [pct(p.percentuale), p.diritto && p.diritto !== "PROPRIETA'" ? p.diritto : null].filter(Boolean).join(" ") || "Partecipazione", true);
    statoSoc(id, p); eventoSocieta(id, p.eventi_negativi);
    dettaglio(id, "Forma", p.forma); dettaglio(id, "Ateco", [p.ateco_codice, p.ateco_descrizione].filter(Boolean).join(" ") || null);
    dettaglio(id, "Fatturato", importo(p.fatturato)); dettaglio(id, "Utile", importo(p.utile));
  }
  for (const p of sociPrincipali) arco(nodo({ tipo: "solo_nome", nome: p.nome, cf: null }, 2), p.verso, "socio_principale", "Socio principale", true);
  // Eventi dei soggetti (FM99-B): stessi testi di eventiSoggettiCerved, abbinati per codice fiscale.
  const ev = lr.eventi_negativi;
  const { perCf, altri } = eventiSoggettiCerved((ev?.collegati ?? []) as Record<string, unknown>[], ev?.altri_soggetti ?? [], lr.societa_collegate ?? [], (lr.esponenti ?? []) as EsponenteCerved[]);
  const tutti = [...Object.entries(perCf).map(([cf, eventi]) => ({ cf, eventi })), ...altri.map((a) => ({ cf: a.codice_fiscale, eventi: a.eventi }))];
  for (const { cf, eventi } of tutti) {
    const k = chiaveFiscaleValida(cf); if (!k) continue;
    for (const fam of ["societa", "persona"] as const) { const id = alias.get(`${fam}:cf:${k}`); if (id && id !== CENTRO) aggiungiEventi(id, eventi); }
  }
  return { nodi: [...nodi.values()], archi: [...archi.values()] };
}

/** Chiavi fiscali (gemello di riconcilia_lead_clienti) dei nodi, centro escluso, persone incluse (ditte individuali). */
export function chiaviFiscaliGrafo(nodi: NodoGrafo[]): string[] {
  return [...new Set(nodi.filter((n) => n.tipo !== "centro").map((n) => chiaveFiscaleValida(n.codice_fiscale)).filter((x): x is string => !!x))];
}

export type ClienteMadeGrafo = {
  chiave: string; cliente_id: string; ragione_sociale: string | null; codice: string | null; sede: string | null;
  fido: number; esposizione: number | null; scaduto: number; scaduto_oltre_60: number;
  bloccato: boolean; in_gestione_legale: boolean; visibile: boolean; e_questo_cliente: boolean;
  /** Trovato sulle chiavi del centro (P.IVA/CF dell'azienda del report): per il lead = "già cliente MADE". */
  chiave_centro: boolean;
};

export type RigaClienteGrafo = {
  id: string; ragione_sociale: string | null; codice_gestionale: string | null; partita_iva: string | null; codice_fiscale: string | null;
  totale_rischio: number | string | null; bloccato: boolean | null; in_gestione_legale: boolean | null; fido_gestionale?: number | string | null;
  stores?: { nome: string | null } | { nome: string | null }[] | null;
};
/**
 * Righe clienti → ClienteMadeGrafo (una per chiave abbinata). Cliente: e_questo_cliente = stesso id.
 * Lead: e_questo_cliente = trovato sulle chiavi del centro (il lead è già cliente MADE).
 */
export function componiClientiGrafo(righe: RigaClienteGrafo[], o: { chiavi: string[]; chiaviCentro: string[]; scaduti: Map<string, { eur_scaduto: number; eur_grave: number }>; visibili: Set<string>; entita: "cliente" | "lead"; id: string }): ClienteMadeGrafo[] {
  const insieme = new Set(o.chiavi), centro = new Set(o.chiaviCentro);
  const out: ClienteMadeGrafo[] = [];
  for (const r of righe) {
    const proprie = [...new Set([chiaveFiscaleValida(r.partita_iva), chiaveFiscaleValida(r.codice_fiscale)].filter((k): k is string => !!k && insieme.has(k)))];
    const s = o.scaduti.get(r.id);
    for (const chiave of proprie) {
      const chiave_centro = centro.has(chiave);
      out.push({
        chiave, cliente_id: r.id, ragione_sociale: r.ragione_sociale ?? null, codice: r.codice_gestionale ?? null,
        sede: (Array.isArray(r.stores) ? r.stores[0]?.nome : r.stores?.nome) ?? null,
        fido: getFidoAttuale(r), esposizione: r.totale_rischio == null ? null : Number(r.totale_rischio),
        scaduto: Number(s?.eur_scaduto ?? 0), scaduto_oltre_60: Number(s?.eur_grave ?? 0),
        bloccato: !!r.bloccato, in_gestione_legale: !!r.in_gestione_legale, visibile: o.visibili.has(r.id),
        e_questo_cliente: o.entita === "cliente" ? r.id === o.id : chiave_centro, chiave_centro,
      });
    }
  }
  return out;
}
export type TotaliMade = { clienti: number; fido: number; esposizione: number; scaduto: number; scaduto_oltre_60: number };
const vuoto = (): TotaliMade => ({ clienti: 0, fido: 0, esposizione: 0, scaduto: 0, scaduto_oltre_60: 0 });
/** Totali per cliente distinto (cliente_id): "questo cliente" separato dagli altri. */
export function riepilogoGruppoMade(clienti: ClienteMadeGrafo[]): { questo: TotaliMade; altri: TotaliMade; totale: TotaliMade } {
  const r = { questo: vuoto(), altri: vuoto(), totale: vuoto() };
  const visti = new Set<string>();
  for (const c of clienti) {
    if (visti.has(c.cliente_id)) continue; visti.add(c.cliente_id);
    for (const t of [c.e_questo_cliente ? r.questo : r.altri, r.totale]) {
      t.clienti += 1; t.fido += c.fido; t.esposizione += c.esposizione ?? 0; t.scaduto += c.scaduto; t.scaduto_oltre_60 += c.scaduto_oltre_60;
    }
  }
  return r;
}

/** Percentuali uniche ("NN%" / "NN,NN%") presenti nelle etichette di un arco, unite con " · "; "" se nessuna. */
export function percentualiArco(arco: Pick<ArcoGrafo, "etichette">): string {
  const viste: string[] = [];
  for (const e of arco.etichette) for (const m of e.matchAll(/\d+(?:[.,]\d+)?\s?%/g)) {
    const v = m[0].replace(/\s/g, "");
    if (!viste.includes(v)) viste.push(v);
  }
  return viste.join(" · ");
}

/** Etichette di un arco senza la sola percentuale (ruoli, "Titolare effettivo", ...), per la vista a fuoco. */
export function ruoliArco(arco: Pick<ArcoGrafo, "etichette">): string {
  return arco.etichette.map((e) => e.replace(/\s*[—-]?\s*(quote\s+)?\d+(?:[.,]\d+)?\s?%/gi, "").trim()).filter(Boolean).join(" · ");
}
