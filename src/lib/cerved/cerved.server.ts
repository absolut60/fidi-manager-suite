/**
 * UNICO punto dell'app che parla con Cerved. La chiave (CERVED_API_KEY) si legge
 * solo qui, al momento della chiamata, e non viene mai registrata né restituita.
 */
const BASE_URL = {
  standard: "https://api.cerved.com/cervedApi",
  b2b: "https://api.cerved.com/cervedApiB2B",
} as const;
const TIMEOUT_MS = 15_000;

export type EsitoCerved = {
  http_status: number | null;
  esito: "ok" | "errore";
  errore: string | null;
  risposta: unknown;
  /** id della riga scritta in cerved_chiamate (null se il registro non è stato salvato). */
  chiamata_id: string | null;
  /** Dati estratti dalla risposta grezza ma NON registrati (es. byte del PDF). */
  extra?: unknown;
};

function messaggioErrore(status: number): string {
  if (status === 401) return "Chiave Cerved non valida (401).";
  if (status === 403) return "Accesso negato da Cerved (403): possibile filtro IP o API non abilitata.";
  if (status === 404) return "Nessun risultato trovato su Cerved (404).";
  if (status === 422) return "Documento troppo grande per essere recuperato da Cerved (422).";
  return `Errore Cerved (HTTP ${status}).`;
}

async function chiamaCerved(opts: {
  operazione: string;
  percorso: string;
  parametri: Record<string, string>;
  utenteId: string | null;
  clienteId: string | null;
  base?: keyof typeof BASE_URL;
  metodo?: "GET" | "POST";
  corpo?: Record<string, unknown>;
  /** Trasforma la risposta OK prima di registrarla e restituirla. */
  trasforma?: (corpo: unknown) => unknown;
  /** Estrae dalla risposta OK dati da restituire senza scriverli nel registro. */
  estrai?: (corpo: unknown) => unknown;
}): Promise<EsitoCerved> {
  let extra: unknown = undefined;
  const inizio = Date.now();
  let risultato: Omit<EsitoCerved, "chiamata_id">;
  let chiamataId: string | null = null;
  const apiKey = process.env["CERVED_API_KEY"];
  if (!apiKey) {
    risultato = { http_status: null, esito: "errore", errore: "Chiave Cerved non configurata.", risposta: null };
  } else {
    const qs = new URLSearchParams(opts.parametri).toString();
    const url = `${BASE_URL[opts.base ?? "standard"]}${opts.percorso}${qs ? `?${qs}` : ""}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: opts.metodo ?? "GET",
        headers: { apikey: apiKey, "Content-Type": "application/json", Accept: "*/*" },
        body: opts.corpo ? JSON.stringify(opts.corpo) : undefined,
        signal: controller.signal,
      });
      const testo = await res.text();
      let corpo: unknown = null;
      try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = { testo: testo.slice(0, 5000) }; }
      if (res.ok && opts.estrai) extra = opts.estrai(corpo);
      risultato = res.ok
        ? { http_status: res.status, esito: "ok", errore: null, risposta: opts.trasforma ? opts.trasforma(corpo) : corpo }
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
    const { data: riga, error } = await supabaseAdmin.from("cerved_chiamate").insert({
      utente_id: opts.utenteId,
      cliente_id: opts.clienteId,
      operazione: opts.operazione,
      parametri: (opts.corpo ? { query: opts.parametri, corpo: opts.corpo } : opts.parametri) as never,
      http_status: risultato.http_status,
      esito: risultato.esito,
      errore: risultato.errore,
      durata_ms: Date.now() - inizio,
      risposta: (risultato.risposta ?? null) as never,
    }).select("id").single();
    chiamataId = riga?.id ?? null;
    if (error) console.error("[cerved] registro non salvato", error.message);
  } catch (e) {
    console.error("[cerved] registro non salvato", e instanceof Error ? e.message : "errore");
  }
  return { ...risultato, chiamata_id: chiamataId, ...(extra !== undefined ? { extra } : {}) };
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

type Ctx = { utenteId: string | null; clienteId: string | null };

/** Prodotti acquistabili per un soggetto (sola lettura, nessun acquisto). */
export function prodottiAcquistabili(idSoggetto: string, ctx: Ctx) {
  return chiamaCerved({
    operazione: "purchasable_products",
    base: "b2b",
    percorso: `/v1/purchasable/subjects/${encodeURIComponent(idSoggetto)}`,
    parametri: {},
    ...ctx,
  });
}

/** Report già acquistati in archivio per partita IVA (sola lettura). */
export function cercaDocumentiArchivio(piva: string, ctx: Ctx) {
  return chiamaCerved({
    operazione: "archived_documents",
    base: "b2b",
    metodo: "POST",
    percorso: "/v1/search/archived/documents",
    parametri: {},
    corpo: { vat_number: piva, show_reports_other_users: true, page_number: 1, page_size: 20 },
    ...ctx,
  });
}

/** Decodifica base64 → testo UTF-8 (compatibile con il runtime Worker). */
export function decodificaBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

export type DocumentoRecuperato = {
  delivery_status: string | null;
  detailed_delivery_status: string | null;
  format: string | null;
  request_id: string | null;
  contenuto_xml: string | null;
};

/** Sostituisce il base64 "content" con il testo XML decodificato. */
export function normalizzaDocumentoCerved(corpo: unknown): DocumentoRecuperato {
  const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  let xml: string | null = null;
  const c = o["content"];
  if (typeof c === "string" && c) {
    try { xml = decodificaBase64Utf8(c); } catch { xml = null; }
  }
  return {
    delivery_status: testo(o["delivery_status"]),
    detailed_delivery_status: testo(o["detailed_delivery_status"]),
    format: testo(o["format"]),
    request_id: testo(o["request_id"]),
    contenuto_xml: xml,
  };
}

/** Recupera un documento già acquistato in formato XML (sola lettura, nessun acquisto). */
export function recuperaDocumento(requestId: string, ctx: Ctx) {
  return chiamaCerved({
    operazione: "document_retrieve",
    base: "b2b",
    percorso: `/v1/purchase/request/${encodeURIComponent(requestId)}/format/XML`,
    parametri: {},
    trasforma: normalizzaDocumentoCerved,
    ...ctx,
  });
}

/** Trova il primo array di oggetti fra le chiavi indicate (o la radice se è un array). */
function primoArray(corpo: unknown, chiavi: string[]): Record<string, unknown>[] {
  if (Array.isArray(corpo)) return corpo.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  for (const k of chiavi) {
    const v = o[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  return [];
}

export type ProdottoCerved = { codice: string | null; descrizione: string | null };

export function normalizzaProdottiCerved(corpo: unknown): ProdottoCerved[] {
  return primoArray(corpo, ["available_products"]).map((p) => ({
    codice: testo(p["code"]),
    descrizione: testo(p["description"]),
  }));
}

export type ReportArchivioCerved = {
  request_id: string | null;
  product_id: string | null;
  request_date: string | null;
  delivery_date: string | null;
  monitoring_expiry_date: string | null;
  expired_monitoring: boolean | null;
  document_formats: string[];
  user_id: string | null;
};

export function normalizzaArchivioCerved(corpo: unknown): ReportArchivioCerved[] {
  return primoArray(corpo, ["reports"]).map((d) => {
    const f = d["document_formats"];
    return {
      request_id: testo(d["request_id"]),
      product_id: testo(d["product_id"]),
      request_date: testo(d["request_date"]),
      delivery_date: testo(d["delivery_date"]),
      monitoring_expiry_date: testo(d["monitoring_expiry_date"]),
      expired_monitoring: booleano(d["expired_monitoring"]),
      document_formats: Array.isArray(f) ? f.map((x) => String(typeof x === "object" && x ? ((x as Record<string, unknown>)["format"] ?? JSON.stringify(x)) : x)) : f != null ? [String(f)] : [],
      user_id: testo(d["user_id"]),
    };
  });
}

/** Report più recente per request_date (stringa grezza: confronto su data GG-MM-AAAA o ISO). */
export function reportPiuRecente(reports: ReportArchivioCerved[]): ReportArchivioCerved | null {
  const chiave = (s: string | null) => {
    if (!s) return "";
    const m = /^(\d{2})[-/](\d{2})[-/](\d{4})(.*)$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}${m[4]}` : s;
  };
  const validi = reports.filter((r) => r.request_id);
  if (!validi.length) return null;
  return validi.reduce((a, b) => (chiave(b.request_date) > chiave(a.request_date) ? b : a));
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
    data_iscrizione_rea: formattaDataCerved(testo(att.data_iscrizione_rea ?? a.data_iscrizione_rea)),
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
    data_costituzione: formattaDataCerved(testo(att.data_costituzione)),
    data_inizio_attivita: formattaDataCerved(testo(att.data_inizio_attivita)),
    stato_attivita_codice: codice,
    stato_attivita_descrizione: testo(att.stato_attivita) ?? (statoKey ? (STATO_ATTIVITA_CERVED[statoKey] ?? null) : null),
    data_stato_attivita: formattaDataCerved(testo(att.data_stato_attivita)),
    macrosettore,
    gruppo: booleano(grp.flag_gruppo),
    capogruppo,
    rating_legalita: testo(rating.rating),
    rating_legalita_rinnovo: formattaDataCerved(testo(rating.data_rinnovo)),
    data_chiusura_ultimo_bilancio: formattaDataCerved(testo(eco.data_chiusura_ultimo_bilancio)),
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

/**
 * Sceglie fra companies[] di entitySearch l'azienda con la stessa partita IVA
 * (confronto su sole cifre). Più corrispondenze → la prima; nessuna → null.
 */
export function scegliAziendaPerPiva(risposta: unknown, piva: string): unknown | null {
  const cifre = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const target = cifre(piva);
  if (!target) return null;
  const corpo = (risposta && typeof risposta === "object" ? risposta : {}) as { companies?: unknown };
  const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];
  for (const a of aziende) {
    const da = (a && typeof a === "object" ? (a as Record<string, unknown>)["dati_anagrafici"] : null) as Record<string, unknown> | null;
    if (da && cifre(da["partita_iva"]) === target) return a;
  }
  return null;
}

// ── Dati estesi (sola lettura) ────────────────────────────────────────────

/** Elenco dei bilanci disponibili per un soggetto. */
export function elencoBilanciCerved(idSoggetto: string, ctx: Ctx) {
  return chiamaCerved({
    operazione: "cerved_balancesheets_list",
    percorso: "/v1/entityProfile/cerved/balancesheetslist",
    parametri: { id_soggetto: idSoggetto },
    ...ctx,
  });
}

/** Un bilancio: data_chiusura 'dd-MM-yyyy', tipo 'E' o 'C'. */
export function bilancioCerved(idSoggetto: string, dataChiusura: string, tipo: "E" | "C", ctx: Ctx) {
  return chiamaCerved({
    operazione: "cerved_balancesheet",
    percorso: "/v1/entityProfile/cerved/balancesheet",
    parametri: { id_soggetto: idSoggetto, data_chiusura: dataChiusura, tipo_bilancio: tipo },
    ...ctx,
  });
}

/** Fido accordabile Cerved (FCERT o FMED). */
export function fidoCerved(idSoggetto: string, codice: "FCERT" | "FMED", ctx: Ctx) {
  return chiamaCerved({
    operazione: `fido_${codice.toLowerCase()}`,
    percorso: `/v1.1/fido/accordabile/impresa/finance/${codice}`,
    parametri: { id_soggetto: idSoggetto },
    ...ctx,
  });
}

/** Flag degli eventi negativi (tutte le categorie). */
export function eventiNegativiFlag(idSoggetto: string, ctx: Ctx) {
  return chiamaCerved({
    operazione: "negative_flags",
    percorso: "/v1.1/rischi/negative/events/flags/ALL",
    parametri: { subjectId: idSoggetto },
    ...ctx,
  });
}

/** Tutti gli oggetti annidati nella risposta (visita in profondità). */
function oggettiAnnidati(v: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(v)) v.forEach((x) => oggettiAnnidati(x, out));
  else if (v && typeof v === "object") {
    out.push(v as Record<string, unknown>);
    Object.values(v).forEach((x) => oggettiAnnidati(x, out));
  }
  return out;
}

/** 'dd-MM-yyyy' → 'yyyyMMdd' per ordinare (sola manipolazione di stringa). */
function chiaveData(d: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(d);
  return m ? `${m[3]}${m[2]}${m[1]}` : d;
}

export type BilancioElenco = { data_chiusura: string; tipo: string | null };

/** Bilanci dell'elenco: ogni oggetto con data_chiusura (campo tipo/tipo_bilancio se presente). */
export function normalizzaElencoBilanci(corpo: unknown): BilancioElenco[] {
  const visti = new Set<string>();
  const out: BilancioElenco[] = [];
  for (const o of oggettiAnnidati(corpo)) {
    const d = o["data_chiusura"] ?? o["data_chiusura_bilancio"];
    if (typeof d !== "string" || !d) continue;
    const t = o["tipo_bilancio"] ?? o["tipo"] ?? null;
    const tipo = t == null ? null : typeof t === "object" ? String((t as Record<string, unknown>)["codice"] ?? "") || null : String(t);
    const k = `${d}|${tipo}`;
    if (visti.has(k)) continue;
    visti.add(k);
    out.push({ data_chiusura: d, tipo });
  }
  return out;
}

/** I due bilanci di tipo 'E' più recenti per data di chiusura. */
export function dueBilanciEPiuRecenti(elenco: BilancioElenco[]): BilancioElenco[] {
  return elenco
    .filter((b) => (b.tipo ?? "").toUpperCase() === "E")
    .sort((a, b) => chiaveData(b.data_chiusura).localeCompare(chiaveData(a.data_chiusura)))
    .slice(0, 2);
}

/** Riassunto di un bilancio: sezioni = array di primo livello, voci = elementi totali in essi. */
export function riassuntoBilancio(corpo: unknown): { sezioni: number; voci: number } {
  let sezioni = 0;
  let voci = 0;
  const radice = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const visita = (o: Record<string, unknown>) => {
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) { sezioni++; voci += v.length; }
      else if (v && typeof v === "object") visita(v as Record<string, unknown>);
    }
  };
  visita(radice);
  return { sezioni, voci };
}

/** Primo valore_fido trovato nella risposta. */
export function valoreFidoCerved(corpo: unknown): number | string | null {
  for (const o of oggettiAnnidati(corpo)) {
    const v = o["valore_fido"];
    if (typeof v === "number" || typeof v === "string") return v;
  }
  return null;
}

/** Flag booleani/testuali degli eventi negativi, appiattiti "chiave: valore". */
export function flagEventiNegativi(corpo: unknown): string[] {
  const out: string[] = [];
  for (const o of oggettiAnnidati(corpo)) {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "boolean") out.push(`${k}: ${v ? "Sì" : "No"}`);
      else if (/flag/i.test(k) && (typeof v === "string" || typeof v === "number")) out.push(`${k}: ${v}`);
    }
  }
  return out.slice(0, 50);
}

// ── Normalizzatori per le fotografie del cliente (fonte unica, FM57 C4) ──

const numeroCerved = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export type BilancioCervedNorm = {
  data_chiusura: string | null;
  tipo_bilancio: string | null;
  valore_produzione: number | null;
  ricavi: number | null;
  acquisti: number | null;
  utile: number | null;
  patrimonio_netto: number | null;
  totale_attivo: number | null;
  debiti: number | null;
  debiti_banche: number | null;
  debiti_fornitori: number | null;
  crediti_clienti: number | null;
  liquidita: number | null;
  dipendenti: number | null;
  mol: number | null;
};

/**
 * Bilancio Cerved: legge voci_integrale (tutte le sezioni) per codice_voce.
 * Regola: i valori sono GIÀ in euro (non moltiplicare). MOL = 270 − 320 − 330
 * − 302 − 304 − 370 (voce mancante = 0; senza 270 → null).
 */
export function normalizzaBilancioCerved(risposta: unknown): BilancioCervedNorm {
  const r = risposta && typeof risposta === "object" ? (risposta as Record<string, unknown>) : {};
  const voci = new Map<string, number | null>();
  for (const o of oggettiAnnidati(r["voci_integrale"])) {
    const c = testo(o["codice_voce"]);
    if (c == null || voci.has(c)) continue;
    voci.set(c, numeroCerved(o["valore"] ?? o["importo"] ?? o["valore_voce"]));
  }
  const v = (c: string) => voci.get(c) ?? null;
  const vp = v("270");
  const mol = vp == null ? null
    : vp - ["320", "330", "302", "304", "370"].reduce((s, c) => s + (v(c) ?? 0), 0);
  const tb = r["tipo_bilancio"];
  return {
    data_chiusura: formattaDataCerved(testo(r["data_chiusura"] ?? r["data_chiusura_bilancio"])),
    tipo_bilancio: tb && typeof tb === "object" ? testo((tb as Record<string, unknown>)["codice"]) : testo(tb),
    valore_produzione: vp,
    ricavi: v("280"),
    acquisti: v("320"),
    utile: v("477"),
    patrimonio_netto: v("160"),
    totale_attivo: v("150"),
    debiti: v("190"),
    debiti_banche: v("193"),
    debiti_fornitori: v("195"),
    crediti_clienti: v("102"),
    liquidita: v("120"),
    dipendenti: v("480"),
    mol,
  };
}

export type FlagEventiCerved = {
  protesti: boolean | null;
  pregiudizievoli: boolean | null;
  procedure: boolean | null;
  eventi_crisi: boolean | null;
  cigs: boolean | null;
  fallimenti_propri: boolean | null;
};
export type EventiNegativiCervedNorm = {
  azienda: FlagEventiCerved | null;
  persone: (FlagEventiCerved & { nome: string | null })[];
};

const flagDa = (o: Record<string, unknown>): FlagEventiCerved => ({
  protesti: booleano(o["protests"]),
  pregiudizievoli: booleano(o["prejudicialEvents"]),
  procedure: booleano(o["procedures"]),
  eventi_crisi: booleano(o["crisisEvents"]),
  cigs: booleano(o["cigs"]),
  fallimenti_propri: booleano(o["personalBankruptcies"]),
});

/** Flag eventi negativi (nomi reali): azienda dal primo elemento di companies, persone da people (name). */
export function normalizzaEventiNegativiCerved(risposta: unknown): EventiNegativiCervedNorm {
  const r = risposta && typeof risposta === "object" ? (risposta as Record<string, unknown>) : {};
  const comp = Array.isArray(r["companies"]) ? r["companies"] : [];
  const ppl = Array.isArray(r["people"]) ? r["people"] : [];
  const primo = comp[0] && typeof comp[0] === "object" ? (comp[0] as Record<string, unknown>) : null;
  return {
    azienda: primo ? flagDa(primo) : null,
    persone: ppl.filter((p) => p && typeof p === "object").map((p) => {
      const o = p as Record<string, unknown>;
      return { nome: testo(o["name"]), ...flagDa(o) };
    }),
  };
}

export type FidoCervedNorm = { codice: string | null; descrizione: string | null; valore: number | null };

/** Fido Cerved: risposta piatta con codice_fido, descrizione_fido, valore_fido. */
export function normalizzaFidoCerved(risposta: unknown): FidoCervedNorm {
  const r = risposta && typeof risposta === "object" ? (risposta as Record<string, unknown>) : {};
  return {
    codice: testo(r["codice_fido"]),
    descrizione: testo(r["descrizione_fido"]),
    valore: numeroCerved(r["valore_fido"]),
  };
}

// ---------------------------------------------------------------------------
// Light Report (prodotto 52015): acquisto e recupero XML/PDF.
// ---------------------------------------------------------------------------

export const PRODOTTO_LIGHT_REPORT = 52015;
const ATTESA_DEFERRED_MS = 15_000;
const MAX_ATTESA_DEFERRED_MS = 60_000;

/** Base64 → byte (runtime Worker). */
export function decodificaBase64Byte(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Recupera un documento acquistato nel formato indicato. Per il PDF i byte vanno in `extra`, non nel registro. */
export function recuperaDocumentoFormato(requestId: string, formato: "XML" | "PDF", ctx: Ctx) {
  if (formato === "XML") return recuperaDocumento(requestId, ctx);
  return chiamaCerved({
    operazione: "document_retrieve_pdf",
    base: "b2b",
    percorso: `/v1/purchase/request/${encodeURIComponent(requestId)}/format/PDF`,
    parametri: {},
    trasforma: (corpo) => {
      const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
      const c = o["content"];
      return {
        delivery_status: testo(o["delivery_status"]),
        detailed_delivery_status: testo(o["detailed_delivery_status"]),
        format: testo(o["format"]),
        request_id: testo(o["request_id"]),
        lunghezza_base64: typeof c === "string" ? c.length : 0,
      };
    },
    estrai: (corpo) => {
      const c = (corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>)["content"] : null);
      if (typeof c !== "string" || !c) return null;
      try { return decodificaBase64Byte(c); } catch { return null; }
    },
    ...ctx,
  });
}

export type EsitoAcquistoLightReport = {
  http_status: number | null;
  esito: "ok" | "errore";
  errore: string | null;
  request_id: string | null;
  delivery_status: string | null;
  risposta: unknown;
};

/**
 * Acquisto del Light Report (POST B2B /v1/purchase). Se la consegna è DEFERRED
 * riprova il recupero XML ogni 15 s per al massimo 1 minuto, poi restituisce lo stato senza errore.
 */
export async function acquistaLightReport(
  subjectId: string,
  formato: "XML" | "PDF",
  reference: string | null,
  ctx: Ctx,
): Promise<EsitoAcquistoLightReport> {
  const corpo: Record<string, unknown> = {
    format: formato,
    product_id: PRODOTTO_LIGHT_REPORT,
    subject_id: Number.isFinite(Number(subjectId)) ? Number(subjectId) : subjectId,
    language: "ITALIAN",
  };
  if (reference) corpo["reference"] = reference;
  const r = await chiamaCerved({ operazione: "purchase_light_report", base: "b2b", metodo: "POST", percorso: "/v1/purchase", parametri: {}, corpo, ...ctx });
  const o = (r.risposta && typeof r.risposta === "object" ? r.risposta : {}) as Record<string, unknown>;
  const requestId = testo(o["request_id"]);
  let stato = testo(o["delivery_status"]);
  if (r.esito === "ok" && requestId && (stato ?? "").toUpperCase() === "DEFERRED") {
    const inizio = Date.now();
    while (Date.now() - inizio < MAX_ATTESA_DEFERRED_MS && (stato ?? "").toUpperCase() === "DEFERRED") {
      await new Promise((res) => setTimeout(res, ATTESA_DEFERRED_MS));
      const d = await recuperaDocumento(requestId, ctx);
      if (d.esito === "ok") stato = (d.risposta as DocumentoRecuperato).delivery_status ?? stato;
    }
  }
  return { http_status: r.http_status, esito: r.esito, errore: r.errore, request_id: requestId, delivery_status: stato, risposta: r.risposta };
}

export type DatiLightReportXml = {
  fido_certificato: number | null;
  data_report: string | null;
  tag_livello_1: string[];
  tag_livello_2: string[];
};

/** Nome locale di un tag (senza prefisso di namespace). */
const nomeLocale = (n: string) => n.split(":").pop() ?? n;

/**
 * Legge dal Light Report XML il fido certificato (AverageGrantableCredit/CreditLimit/Value)
 * e, se presente, la data del report; elenca i tag dei primi due livelli. Nessun altro percorso.
 */
export function estraiDatiLightReportXml(xml: string): DatiLightReportXml {
  const corpo = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const re = /<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>/g;
  const pila: string[] = [];
  const l1: string[] = [];
  const l2: string[] = [];
  let fido: number | null = null;
  let dataReport: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo))) {
    const [, chiusura, nomeRaw, autoChiuso] = m;
    const nome = nomeLocale(nomeRaw);
    if (chiusura) { pila.pop(); continue; }
    if (pila.length === 0 && !l1.includes(nome)) l1.push(nome);
    if (pila.length === 1 && !l2.includes(nome)) l2.push(nome);
    pila.push(nome);
    const fine = corpo.indexOf("<", re.lastIndex);
    const valore = autoChiuso ? "" : corpo.slice(re.lastIndex, fine < 0 ? undefined : fine).trim();
    const percorso = pila.join("/");
    if (fido == null && valore && /(^|\/)AverageGrantableCredit\/CreditLimit\/Value$/.test(percorso)) {
      const n = Number(valore.replace(",", "."));
      if (Number.isFinite(n)) fido = n;
    }
    if (dataReport == null && valore && /^(ReportDate|DataReport|ReportCreationDate)$/i.test(nome)) dataReport = valore;
    if (autoChiuso) pila.pop();
  }
  return { fido_certificato: fido, data_report: dataReport, tag_livello_1: l1, tag_livello_2: l2 };
}
