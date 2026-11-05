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
