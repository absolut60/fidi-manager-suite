import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Prova di ricerca Cerved per partita IVA: solo amministratori. */
export const provaCercaCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { piva: string }) =>
    z.object({ piva: z.string().regex(/^\d{11}$/, "La partita IVA deve avere 11 cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");

    const { data: cli } = await context.supabase
      .from("clienti").select("id").eq("partita_iva", data.piva).limit(1).maybeSingle();

    const { cercaSoggettoPerPiva, leggiProfilo, leggiScore, normalizzaAziendaCerved, normalizzaProfiloCerved, normalizzaScoreCerved } =
      await import("./cerved.server");
    const ctx = { utenteId: context.userId, clienteId: cli?.id ?? null };
    const r = await cercaSoggettoPerPiva(data.piva, ctx);

    const corpo = (r.risposta ?? {}) as { companies?: unknown[] };
    const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];
    const prima = aziende.length > 0 ? normalizzaAziendaCerved(aziende[0]) : null;

    let profilo = null as null | { errore: string | null; dati: ReturnType<typeof normalizzaProfiloCerved> | null };
    let score = null as null | { errore: string | null; dati: ReturnType<typeof normalizzaScoreCerved> };
    if (prima?.id_soggetto) {
      const [p, s] = await Promise.all([leggiProfilo(prima.id_soggetto, ctx), leggiScore(prima.id_soggetto, ctx)]);
      profilo = p.esito === "ok"
        ? { errore: null, dati: normalizzaProfiloCerved(p.risposta) }
        : { errore: p.errore ?? "Errore nella lettura del profilo.", dati: null };
      score = s.esito === "ok"
        ? { errore: null, dati: normalizzaScoreCerved(s.risposta) }
        : { errore: s.errore ?? "Errore nella lettura dello score.", dati: [] };
    }

    return {
      http_status: r.http_status,
      esito: r.esito,
      errore: r.errore,
      numero_aziende: aziende.length,
      cliente_trovato: !!cli,
      prima,
      profilo,
      score,
    };
  });

/** Prova archivio Cerved (sola lettura, NESSUN acquisto): solo amministratori. */
export const provaArchivioCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { piva: string }) =>
    z.object({ piva: z.string().regex(/^\d{11}$/, "La partita IVA deve avere 11 cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");

    const { data: cli } = await context.supabase
      .from("clienti").select("id").eq("partita_iva", data.piva).limit(1).maybeSingle();

    const m = await import("./cerved.server");
    const ctx = { utenteId: context.userId, clienteId: cli?.id ?? null };

    const ricerca = await m.cercaSoggettoPerPiva(data.piva, ctx);
    const corpo = (ricerca.risposta ?? {}) as { companies?: unknown[] };
    const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];
    const idSoggetto = aziende.length > 0 ? m.normalizzaAziendaCerved(aziende[0])?.id_soggetto ?? null : null;

    const [pr, ar] = await Promise.all([
      idSoggetto ? m.prodottiAcquistabili(idSoggetto, ctx) : Promise.resolve(null),
      m.cercaDocumentiArchivio(data.piva, ctx),
    ]);

    const prodotti = !idSoggetto
      ? { errore: ricerca.esito === "ok" ? "Soggetto non trovato su Cerved: prodotti non verificabili." : (ricerca.errore ?? "Ricerca soggetto non riuscita."), dati: [] }
      : pr!.esito === "ok"
        ? { errore: null, dati: m.normalizzaProdottiCerved(pr!.risposta) }
        : { errore: pr!.errore ?? "Errore nella lettura dei prodotti.", dati: [] };

    const reports = ar.esito === "ok" ? m.normalizzaArchivioCerved(ar.risposta) : [];
    const archivio = { errore: ar.esito === "ok" ? null : (ar.errore ?? "Errore nella ricerca in archivio."), dati: reports };

    let documento: null | { errore: string | null; request_id: string; delivery_status: string | null; lunghezza: number; anteprima: string } = null;
    const recente = m.reportPiuRecente(reports);
    if (recente?.request_id) {
      const d = await m.recuperaDocumento(recente.request_id, ctx);
      const doc = d.esito === "ok" ? (d.risposta as ReturnType<typeof m.normalizzaDocumentoCerved>) : null;
      const xml = doc?.contenuto_xml ?? "";
      documento = {
        errore: d.esito === "ok" ? null : (d.errore ?? "Errore nel recupero del documento."),
        request_id: recente.request_id,
        delivery_status: doc?.delivery_status ?? null,
        lunghezza: xml.length,
        anteprima: xml.slice(0, 1500),
      };
    }

    return { id_soggetto: idSoggetto, cliente_trovato: !!cli, prodotti, archivio, documento };
  });

/** Recupero di un documento già acquistato (XML), sola lettura, NESSUN acquisto: solo amministratori. */
export const provaRecuperoCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { request_id: string }) =>
    z.object({ request_id: z.string().regex(/^\d{1,20}$/, "Il numero richiesta deve contenere solo cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");
    const m = await import("./cerved.server");
    const d = await m.recuperaDocumento(data.request_id, { utenteId: context.userId, clienteId: null });
    const doc = d.esito === "ok" ? (d.risposta as ReturnType<typeof m.normalizzaDocumentoCerved>) : null;
    const xml = doc?.contenuto_xml ?? "";
    return {
      errore: d.esito === "ok" ? null : (d.errore ?? "Errore nel recupero del documento."),
      http_status: d.http_status,
      request_id: data.request_id,
      delivery_status: doc?.delivery_status ?? null,
      detailed_delivery_status: doc?.detailed_delivery_status ?? null,
      lunghezza: xml.length,
      anteprima: xml.slice(0, 1500),
    };
  });

/** Prova dati estesi Cerved (bilanci, fido, eventi negativi), sola lettura, NESSUN acquisto: solo amministratori. */
export const provaDatiEstesiCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { piva: string }) =>
    z.object({ piva: z.string().regex(/^\d{11}$/, "La partita IVA deve avere 11 cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");

    const { data: cli } = await context.supabase
      .from("clienti").select("id").eq("partita_iva", data.piva).limit(1).maybeSingle();

    const m = await import("./cerved.server");
    const ctx = { utenteId: context.userId, clienteId: cli?.id ?? null };
    type Passo = { operazione: string; http_status: number | null; esito: string; errore: string | null; riassunto: string[] };
    const passi: Passo[] = [];
    const passo = (operazione: string, r: { http_status: number | null; esito: string; errore: string | null }, riassunto: string[]) =>
      passi.push({ operazione, http_status: r.http_status, esito: r.esito, errore: r.errore, riassunto });

    const ricerca = await m.cercaSoggettoPerPiva(data.piva, ctx);
    const azienda = m.scegliAziendaPerPiva(ricerca.risposta, data.piva);
    const idSoggetto = azienda ? m.normalizzaAziendaCerved(azienda).id_soggetto : null;
    passo("entity_search", ricerca, [idSoggetto ? `ID soggetto ${idSoggetto}` : "Nessuna azienda con questa partita IVA"]);
    if (!idSoggetto) return { id_soggetto: null, passi };

    const el = await m.elencoBilanciCerved(idSoggetto, ctx);
    const elenco = el.esito === "ok" ? m.normalizzaElencoBilanci(el.risposta) : [];
    passo("cerved_balancesheets_list", el, el.esito === "ok"
      ? [`${elenco.length} bilanci`, ...elenco.map((b) => `${b.data_chiusura} (${b.tipo ?? "?"})`)]
      : []);

    for (const b of m.dueBilanciEPiuRecenti(elenco)) {
      const r = await m.bilancioCerved(idSoggetto, b.data_chiusura, "E", ctx);
      const s = r.esito === "ok" ? m.riassuntoBilancio(r.risposta) : null;
      passo(`cerved_balancesheet ${b.data_chiusura}`, r, s ? [`${s.sezioni} sezioni, ${s.voci} voci`] : []);
    }

    for (const codice of ["FCERT", "FMED"] as const) {
      const r = await m.fidoCerved(idSoggetto, codice, ctx);
      const v = r.esito === "ok" ? m.valoreFidoCerved(r.risposta) : null;
      passo(`fido_${codice.toLowerCase()}`, r, r.esito === "ok" ? [`valore_fido: ${v ?? "—"}`] : []);
    }

    const nf = await m.eventiNegativiFlag(idSoggetto, ctx);
    passo("negative_flags", nf, nf.esito === "ok" ? m.flagEventiNegativi(nf.risposta) : []);

    return { id_soggetto: idSoggetto, passi };
  });

/**
 * Prova di ACQUISTO del Light Report (utenza di test, non addebitata): solo amministratori.
 * Entity Search → acquisto XML → recupero XML → recupero PDF dello stesso request_id → PDF in Storage privato.
 * Non scrive in cerved_soggetti/cerved_fotografie.
 */
export const provaAcquistoLightReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { piva: string }) =>
    z.object({ piva: z.string().regex(/^\d{11}$/, "La partita IVA deve avere 11 cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");

    const { data: cli } = await context.supabase
      .from("clienti").select("id, codice_gestionale").eq("partita_iva", data.piva).limit(1).maybeSingle();

    const m = await import("./cerved.server");
    const ctx = { utenteId: context.userId, clienteId: cli?.id ?? null };
    const vuoto = {
      id_soggetto: null as string | null, request_id: null as string | null, delivery_status: null as string | null,
      acquisto: null as null | { http_status: number | null; errore: string | null },
      xml: null as null | { http_status: number | null; errore: string | null; delivery_status: string | null; lunghezza: number },
      pdf: null as null | { http_status: number | null; errore: string | null; byte: number },
      fido_certificato: null as number | null, data_report: null as string | null,
      tag_livello_1: [] as string[], tag_livello_2: [] as string[],
      percorso_pdf: null as string | null, url_pdf: null as string | null, errore: null as string | null,
    };

    const ricerca = await m.cercaSoggettoPerPiva(data.piva, ctx);
    const azienda = m.scegliAziendaPerPiva(ricerca.risposta, data.piva);
    const idSoggetto = azienda ? m.normalizzaAziendaCerved(azienda).id_soggetto : null;
    if (!idSoggetto) {
      return { ...vuoto, errore: ricerca.esito === "ok" ? "Nessuna azienda con questa partita IVA su Cerved." : (ricerca.errore ?? "Ricerca soggetto non riuscita.") };
    }

    const acq = await m.acquistaLightReport(idSoggetto, "XML", cli?.codice_gestionale ?? null, ctx);
    const out = { ...vuoto, id_soggetto: idSoggetto, request_id: acq.request_id, delivery_status: acq.delivery_status,
      acquisto: { http_status: acq.http_status, errore: acq.errore } };
    if (acq.esito !== "ok" || !acq.request_id) return { ...out, errore: acq.errore ?? "Acquisto senza numero richiesta." };

    const x = await m.recuperaDocumentoFormato(acq.request_id, "XML", ctx);
    const doc = x.esito === "ok" ? (x.risposta as ReturnType<typeof m.normalizzaDocumentoCerved>) : null;
    const xmlTesto = doc?.contenuto_xml ?? "";
    out.xml = { http_status: x.http_status, errore: x.errore, delivery_status: doc?.delivery_status ?? null, lunghezza: xmlTesto.length };
    if (doc?.delivery_status) out.delivery_status = doc.delivery_status;
    if (xmlTesto) {
      const d = m.estraiDatiLightReportXml(xmlTesto);
      Object.assign(out, d);
    }

    const p = await m.recuperaDocumentoFormato(acq.request_id, "PDF", ctx);
    const byte = p.extra instanceof Uint8Array ? p.extra : null;
    out.pdf = { http_status: p.http_status, errore: p.errore ?? (p.esito === "ok" && !byte ? "PDF non presente nella risposta." : null), byte: byte?.length ?? 0 };
    if (byte) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const percorso = `cerved/${idSoggetto}/${acq.request_id}.pdf`;
      const { error } = await supabaseAdmin.storage.from(BUCKET_DOCUMENTI_CERVED)
        .upload(percorso, byte, { contentType: "application/pdf", upsert: true });
      if (error) {
        out.pdf.errore = `PDF non salvato: ${error.message}`;
      } else {
        out.percorso_pdf = percorso;
        const { data: firmato } = await supabaseAdmin.storage.from(BUCKET_DOCUMENTI_CERVED).createSignedUrl(percorso, 3600);
        out.url_pdf = firmato?.signedUrl ?? null;
      }
    }
    return out;
  });

/** Bucket privato esistente dei documenti dei clienti, usato anche per i report Cerved. */
const BUCKET_DOCUMENTI_CERVED = "schede-clienti";
