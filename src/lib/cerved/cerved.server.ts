/**
 * UNICO punto dell'app che parla con Cerved. La chiave (CERVED_API_KEY) si legge
 * solo qui, al momento della chiamata, e non viene mai registrata né restituita.
 */
const BASE_URL = "https://api.cerved.com/cervedApi";
const TIMEOUT_MS = 15_000;

export type EsitoCerved = {
  http_status: number | null;
  esito: "ok" | "errore";
  errore: string | null;
  risposta: unknown;
};

function messaggioErrore(status: number): string {
  if (status === 401) return "Chiave Cerved non valida (401).";
  if (status === 403) return "Accesso negato da Cerved (403): possibile filtro IP o API non abilitata.";
  if (status === 404) return "Nessun risultato trovato su Cerved (404).";
  return `Errore Cerved (HTTP ${status}).`;
}

async function chiamaCerved(opts: {
  operazione: string;
  percorso: string;
  parametri: Record<string, string>;
  utenteId: string | null;
  clienteId: string | null;
}): Promise<EsitoCerved> {
  const inizio = Date.now();
  let risultato: EsitoCerved;
  const apiKey = process.env["CERVED_API_KEY"];
  if (!apiKey) {
    risultato = { http_status: null, esito: "errore", errore: "Chiave Cerved non configurata.", risposta: null };
  } else {
    const url = `${BASE_URL}${opts.percorso}?${new URLSearchParams(opts.parametri).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { apikey: apiKey, "Content-Type": "application/json", Accept: "*/*" },
        signal: controller.signal,
      });
      const testo = await res.text();
      let corpo: unknown = null;
      try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = { testo: testo.slice(0, 5000) }; }
      risultato = res.ok
        ? { http_status: res.status, esito: "ok", errore: null, risposta: corpo }
        : { http_status: res.status, esito: "errore", errore: messaggioErrore(res.status), risposta: corpo };
    } catch (e) {
      const timeout = e instanceof Error && e.name === "AbortError";
      risultato = {
        http_status: null,
        esito: "errore",
        errore: timeout ? "Cerved non ha risposto entro 15 secondi (timeout)." : "Errore di rete nella chiamata a Cerved.",
        risposta: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cerved_chiamate").insert({
      utente_id: opts.utenteId,
      cliente_id: opts.clienteId,
      operazione: opts.operazione,
      parametri: opts.parametri,
      http_status: risultato.http_status,
      esito: risultato.esito,
      errore: risultato.errore,
      durata_ms: Date.now() - inizio,
      risposta: (risultato.risposta ?? null) as never,
    });
    if (error) console.error("[cerved] registro non salvato", error.message);
  } catch (e) {
    console.error("[cerved] registro non salvato", e instanceof Error ? e.message : "errore");
  }
  return risultato;
}

export function cercaSoggettoPerPiva(piva: string, ctx: { utenteId: string | null; clienteId: string | null }) {
  return chiamaCerved({
    operazione: "entity_search",
    percorso: "/v1/entitySearch/live",
    parametri: { testoricerca: piva, filtroricerca: "COMPANIES_ONLY" },
    ...ctx,
  });
}

export function leggiProfilo(idSoggetto: string, ctx: { utenteId: string | null; clienteId: string | null }) {
  return chiamaCerved({
    operazione: "entity_profile",
    percorso: "/v1/entityProfile/live",
    parametri: { id_soggetto: idSoggetto },
    ...ctx,
  });
}

export function leggiScore(idSoggetto: string, ctx: { utenteId: string | null; clienteId: string | null }) {
  return chiamaCerved({
    operazione: "score_all_cgs",
    percorso: "/v1.1/score/impresa/corporate/ALL_CGS",
    parametri: { id_soggetto: idSoggetto },
    ...ctx,
  });
}

/* ------------------------------------------------------------------ */
/* Normalizzazione della risposta entitySearch/live — fonte unica.     */
/* Ogni elemento di companies[] ha: dati_anagrafici, dati_attivita,    */
/* dati_pa. Qui si legge SOLO quella struttura.                        */
/* ------------------------------------------------------------------ */

const STATO_ATTIVITA_CERVED: Record<string, string> = {
  A: "attiva",
  C: "cessata",
  D: "in procedure",
  F: "fallita",
  G: "amministrazione giudiziaria",
  I: "inattiva",
  L: "in scioglimento/liquidazione",
  N: "in procedura concorsuale",
  P: "iscrizione",
  R: "registrata",
  S: "sospesa",
  T: "cancellata",
};

const CLASSE_FORMA_CERVED: Record<string, string> = {
  SC: "società di capitali",
  SP: "società di persone",
  DI: "ditta individuale",
  AL: "altre forme",
};

const testo = (v: unknown): string | null =>
  v == null ? null : String(v).trim() === "" ? null : String(v).trim();

const booleano = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = testo(v);
  if (s == null) return null;
  if (/^(s|sì|si|1|true|y|yes|x)$/i.test(s)) return true;
  if (/^(n|no|0|false|f)$/i.test(s)) return false;
  return null;
};

/** Data Cerved "GG-MM-AAAA" → "GG/MM/AAAA" (solo stringa, niente Date); altrimenti invariata. */
export function formattaDataCerved(v: string | null | undefined): string | null {
  if (v == null) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v.trim());
  return m ? `${m[1]}/${m[2]}/${m[3]}` : v;
}

/** "410000" → "41.00.00"; se ha già i punti (o non è a 6 cifre) resta com'è. */
export function formattaAtecoCerved(v: unknown): string | null {
  const s = testo(v);
  if (s == null) return null;
  if (s.includes(".")) return s;
  const cifre = s.replace(/\D/g, "");
  if (cifre.length !== 6) return s;
  return `${cifre.slice(0, 2)}.${cifre.slice(2, 4)}.${cifre.slice(4, 6)}`;
}

export type AziendaCerved = {
  id_soggetto: string | null;
  denominazione: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  stato_attivita_codice: string | null;
  stato_attivita_descrizione: string | null;
  operativa: boolean | null;
  forma_giuridica: string | null;
  classe_forma: "SC" | "SP" | "DI" | "AL" | null;
  classe_forma_descrizione: string | null;
  ateco_2025_codice: string | null;
  ateco_2025_descrizione: string | null;
  rea: string | null;
  data_iscrizione_rea: string | null;
  sede: { indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null } | null;
  ente_pa: boolean;
};

/** Estrae i dati utili da UN elemento di companies[] della risposta Cerved. */
export function normalizzaAziendaCerved(azienda: unknown): AziendaCerved {
  const a = (azienda ?? {}) as Record<string, unknown>;
  const anag = (a.dati_anagrafici ?? {}) as Record<string, unknown>;
  const att = (a.dati_attivita ?? {}) as Record<string, unknown>;
  const pa = (a.dati_pa ?? {}) as Record<string, unknown>;
  const ind = (anag.indirizzo ?? {}) as Record<string, unknown>;
  const form = (att.company_form ?? {}) as Record<string, unknown>;

  const codice = testo(att.codice_stato_attivita ?? a.codice_stato_attivita);
  const statoKey = codice ? codice.toUpperCase().charAt(0) : null;

  const classeRaw = testo(form.company_form_class);
  const classe = classeRaw && classeRaw.toUpperCase() in CLASSE_FORMA_CERVED
    ? (classeRaw.toUpperCase() as AziendaCerved["classe_forma"])
    : null;

  const sede = {
    indirizzo: testo(ind.descrizione),
    cap: testo(ind.cap),
    comune: testo(ind.descrizione_comune),
    provincia: testo(ind.provincia),
  };
  const sedePiena = sede.indirizzo || sede.cap || sede.comune || sede.provincia ? sede : null;

  return {
    id_soggetto: testo(anag.id_soggetto ?? a.id_soggetto),
    denominazione: testo(anag.denominazione ?? a.denominazione),
    partita_iva: testo(anag.partita_iva ?? a.partita_iva),
    codice_fiscale: testo(anag.codice_fiscale ?? a.codice_fiscale),
    stato_attivita_codice: codice,
    stato_attivita_descrizione: statoKey ? (STATO_ATTIVITA_CERVED[statoKey] ?? null) : null,
    operativa: booleano(att.flag_operativa ?? a.flag_operativa),
    forma_giuridica:
      testo(form.description ?? form.descrizione ?? form.code) ??
      testo(att.forma_giuridica ?? a.forma_giuridica),
    classe_forma: classe,
    classe_forma_descrizione: classe ? CLASSE_FORMA_CERVED[classe] : null,
    ateco_2025_codice: formattaAtecoCerved(att.codice_ateco_2025 ?? a.codice_ateco_2025),
    ateco_2025_descrizione: testo(att.ateco_2025 ?? a.ateco_2025),
    rea: testo(att.codice_rea ?? a.codice_rea),
    data_iscrizione_rea: testo(att.data_iscrizione_rea ?? a.data_iscrizione_rea),
    sede: sedePiena,
    ente_pa: booleano(pa.ente) === true,
  };
}

/* ------------------------------------------------------------------ */
/* Profilo (entityProfile/live) e Score (ALL_CGS) — fonte unica.       */
/* Le date Cerved restano stringhe grezze: formato non ancora certo.   */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = testo(v);
  if (s == null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Valori Cerved in migliaia di euro → euro. */
const migliaiaInEuro = (v: unknown): number | null => {
  const n = numero(v);
  return n == null ? null : Math.round(n * 1000);
};
/** Valore che può essere scalare o { valore/value/importo, anno }. */
const valoreDi = (v: unknown): unknown => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Obj;
    return o.valore ?? o.value ?? o.importo ?? o.numero ?? null;
  }
  return v;
};

export type ProfiloCerved = {
  telefono: string | null;
  sito_web: string | null;
  pec: string[];
  data_costituzione: string | null;
  data_inizio_attivita: string | null;
  stato_attivita_codice: string | null;
  stato_attivita_descrizione: string | null;
  data_stato_attivita: string | null;
  macrosettore: string | null;
  gruppo: boolean | null;
  capogruppo: string[];
  rating_legalita: string | null;
  rating_legalita_rinnovo: string | null;
  data_chiusura_ultimo_bilancio: string | null;
  dipendenti: number | null;
  dipendenti_anno: string | null;
  unita_locali: number | null;
  anno_ultimo_bilancio: string | null;
  capitale_sociale: number | null;
  fatturato: number | null;
  mol: number | null;
  attivo: number | null;
  patrimonio_netto: number | null;
  utile_perdita_esercizio: number | null;
};

export function normalizzaProfiloCerved(risposta: unknown): ProfiloCerved {
  const r = obj(risposta);
  const anag = obj(r.dati_anagrafici);
  const att = obj(r.dati_attivita);
  const grp = obj(r.dati_gruppo);
  const eco = obj(r.dati_economici_dimensionali);
  const codifica = obj(obj(att.ateco_2025_info).codifica_ateco);

  const pecRaw = obj(anag.pec).email ?? anag.pec;
  const pec = (Array.isArray(pecRaw) ? pecRaw : [pecRaw])
    .map((e) => testo(typeof e === "object" && e ? (obj(e).email ?? obj(e).indirizzo) : e))
    .filter((e): e is string => !!e);

  const capoRaw = grp.capogruppo ?? grp.capogruppi ?? grp.lista_capogruppo ?? [];
  const capogruppo = (Array.isArray(capoRaw) ? capoRaw : [capoRaw])
    .map((c) => testo(typeof c === "object" && c ? (obj(c).denominazione ?? obj(c).nome ?? obj(c).ragione_sociale) : c))
    .filter((c): c is string => !!c);

  const macro = obj(codifica.macrosettore);
  const macrosettore = typeof codifica.macrosettore === "object"
    ? testo(macro.descrizione ?? macro.description ?? macro.codice)
    : testo(codifica.macrosettore);

  const rating = obj(att.rating_legalita);

  const codice = testo(att.codice_stato_attivita);
  const statoKey = codice ? codice.toUpperCase().charAt(0) : null;
  const dip = eco.numero_dipendenti ?? eco.dipendenti;

  return {
    telefono: testo(anag.telefono ?? obj(anag.contatti).telefono),
    sito_web: testo(anag.url_sito_web)?.toLowerCase() ?? null,
    pec,
    data_costituzione: testo(att.data_costituzione),
    data_inizio_attivita: testo(att.data_inizio_attivita),
    stato_attivita_codice: codice,
    stato_attivita_descrizione: testo(att.stato_attivita) ?? (statoKey ? (STATO_ATTIVITA_CERVED[statoKey] ?? null) : null),
    data_stato_attivita: testo(att.data_stato_attivita),
    macrosettore,
    gruppo: booleano(grp.flag_gruppo),
    capogruppo,
    rating_legalita: testo(rating.rating),
    rating_legalita_rinnovo: testo(rating.data_rinnovo),
    data_chiusura_ultimo_bilancio: testo(eco.data_chiusura_ultimo_bilancio),
    dipendenti: numero(valoreDi(dip)),
    dipendenti_anno: testo(eco.anno_numero_dipendenti_inps),
    unita_locali: numero(valoreDi(eco.numero_unita_locali ?? eco.unita_locali)),
    anno_ultimo_bilancio: testo(eco.anno_ultimo_bilancio),
    capitale_sociale: numero(valoreDi(eco.capitale_sociale)),
    fatturato: migliaiaInEuro(valoreDi(eco.fatturato)),
    mol: migliaiaInEuro(valoreDi(eco.mol)),
    attivo: migliaiaInEuro(valoreDi(eco.attivo)),
    patrimonio_netto: migliaiaInEuro(valoreDi(eco.patrimonio_netto)),
    utile_perdita_esercizio: migliaiaInEuro(valoreDi(eco.utile_perdita_esercizio)),
  };
}

export type ScoreCerved = {
  codice_score: string | null;
  descrizione_score: string | null;
  valore: number | null;
  categoria_codice: string | null;
  categoria_descrizione: string | null;
  pd: number | null;
  trend_codice: string | null;
  trend_descrizione: string | null;
};

export function normalizzaScoreCerved(risposta: unknown): ScoreCerved[] {
  const lista = obj(risposta).scores;
  if (!Array.isArray(lista)) return [];
  const ordine = (c: string | null) => (c === "SEM_CGS" ? 0 : c === "CGS" ? 1 : 2);
  return lista.map((x) => {
    const s = obj(x);
    return {
      codice_score: testo(s.codice_score),
      descrizione_score: testo(s.descrizione_score),
      valore: numero(s.valore),
      categoria_codice: testo(s.categoria_codice),
      categoria_descrizione: testo(s.categoria_descrizione),
      pd: numero(s.pd),
      trend_codice: testo(s.trend_codice),
      trend_descrizione: testo(s.trend_descrizione),
    };
  }).sort((a, b) => ordine(a.codice_score) - ordine(b.codice_score));
}
