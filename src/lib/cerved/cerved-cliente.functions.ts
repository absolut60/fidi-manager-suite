import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Collega (se serve) un cliente al suo soggetto Cerved e salva profilo e score
 * come nuove fotografie. Sola lettura verso Cerved: nessun acquisto.
 * Permesso: public.auth_puo_aggiornare_cerved() (gemello puoAggiornareCerved).
 */
export const aggiornaCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di aggiornare i dati Cerved");

    const { data: cli } = await context.supabase
      .from("clienti").select("id, ragione_sociale, partita_iva").eq("id", data.clienteId).maybeSingle();
    if (!cli) throw new Error("Cliente non trovato");

    const piva = String(cli.partita_iva ?? "").replace(/\D/g, "");
    if (piva.length !== 11) {
      throw new Error("Il cliente non ha una partita IVA valida: il collegamento a Cerved avviene tramite partita IVA");
    }

    const m = await import("./cerved.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const utente = context.userId;
    const ctx = { utenteId: utente, clienteId: cli.id };

    const { data: esistente, error: errLink } = await supabaseAdmin
      .from("cerved_soggetti").select("id_soggetto, denominazione_cerved").eq("cliente_id", cli.id).maybeSingle();
    if (errLink) throw new Error("Impossibile leggere il collegamento Cerved del cliente");

    let idSoggetto: number;
    let denominazione: string | null = esistente?.denominazione_cerved ?? null;
    let ricerca: null | { dati: ReturnType<typeof m.normalizzaAziendaCerved>; chiamata_id: string | null } = null;

    if (esistente) {
      idSoggetto = Number(esistente.id_soggetto);
    } else {
      const r = await m.cercaSoggettoPerPiva(piva, ctx);
      if (r.esito !== "ok") throw new Error(r.errore ?? "Ricerca su Cerved non riuscita");
      const scelta = m.scegliAziendaPerPiva(r.risposta, piva);
      if (!scelta) throw new Error("Nessuna azienda trovata su Cerved con questa partita IVA");
      const norm = m.normalizzaAziendaCerved(scelta);
      const id = Number(norm.id_soggetto);
      if (!norm.id_soggetto || !Number.isFinite(id)) throw new Error("Nessuna azienda trovata su Cerved con questa partita IVA");
      idSoggetto = id;
      denominazione = norm.denominazione;
      ricerca = { dati: norm, chiamata_id: r.chiamata_id };
    }

    const ids = String(idSoggetto);
    // Fido certificato: arriva dal Light Report (Credit Limit dà 403, fuori contratto): fidoCerved non si chiama più.
    const [p, s, el, ev] = await Promise.all([
      m.leggiProfilo(ids, ctx),
      m.leggiScore(ids, ctx),
      m.elencoBilanciCerved(ids, ctx),
      m.eventiNegativiFlag(ids, ctx),
    ]);
    // Bilanci: i due di tipo 'E' più recenti (nessuno, es. ditte individuali → niente foto, niente errore).
    const scelti = el.esito === "ok" ? m.dueBilanciEPiuRecenti(m.normalizzaElencoBilanci(el.risposta)) : [];
    const bil = await Promise.all(scelti.map((b) => m.bilancioCerved(ids, b.data_chiusura, "E", ctx)));

    const ora = new Date().toISOString();
    if (esistente) {
      const { error } = await supabaseAdmin.from("cerved_soggetti")
        .update({ ultimo_aggiornamento: ora, aggiornato_da: utente }).eq("cliente_id", cli.id);
      if (error) throw new Error("Impossibile salvare l'aggiornamento Cerved del cliente");
    } else {
      const { error } = await supabaseAdmin.from("cerved_soggetti").insert({
        cliente_id: cli.id, id_soggetto: idSoggetto, partita_iva: piva, denominazione_cerved: denominazione,
        collegato_da: utente, ultimo_aggiornamento: ora, aggiornato_da: utente,
      });
      if (error) throw new Error("Impossibile salvare il collegamento Cerved del cliente");
    }

    const errori: string[] = [];
    const foto: { tipo: string; dati: unknown; chiamata_id: string | null }[] = [];
    if (ricerca) foto.push({ tipo: "ricerca", dati: ricerca.dati, chiamata_id: ricerca.chiamata_id });
    if (p.esito === "ok") foto.push({ tipo: "profilo", dati: m.normalizzaProfiloCerved(p.risposta), chiamata_id: p.chiamata_id });
    else errori.push(`Profilo: ${p.errore ?? "lettura non riuscita"}`);
    if (s.esito === "ok") foto.push({ tipo: "score", dati: { scores: m.normalizzaScoreCerved(s.risposta) }, chiamata_id: s.chiamata_id });
    else errori.push(`Score: ${s.errore ?? "lettura non riuscita"}`);

    let bilanciOk = el.esito === "ok";
    if (!bilanciOk) errori.push(`Bilanci: ${el.errore ?? "lettura non riuscita"}`);
    const anni = bil.filter((b) => b.esito === "ok").map((b) => m.normalizzaBilancioCerved(b.risposta));
    bil.filter((b) => b.esito !== "ok").forEach((b) => errori.push(`Bilancio: ${b.errore ?? "lettura non riuscita"}`));
    if (bil.some((b) => b.esito !== "ok")) bilanciOk = false;
    if (anni.length) foto.push({ tipo: "bilancio", dati: { anni }, chiamata_id: bil.find((b) => b.esito === "ok")?.chiamata_id ?? null });

    if (ev.esito === "ok") foto.push({ tipo: "eventi_negativi", dati: m.normalizzaEventiNegativiCerved(ev.risposta), chiamata_id: ev.chiamata_id });
    else errori.push(`Eventi negativi: ${ev.errore ?? "lettura non riuscita"}`);

    if (foto.length) {
      const { error } = await supabaseAdmin.from("cerved_fotografie").insert(
        foto.map((f) => ({
          cliente_id: cli.id, id_soggetto: idSoggetto, tipo: f.tipo, dati: f.dati as never,
          chiamata_id: f.chiamata_id, letta_da: utente,
        })),
      );
      if (error) {
        console.error("[cerved] fotografie non salvate", error.message);
        errori.push("Non è stato possibile salvare i dati Cerved letti");
      }
    }

    // Light Report: se c'è un report valido si recupera gratis con il request_id (nessun acquisto).
    const rep = await reportValido(supabaseAdmin, cli.id);
    let lightReport: null | Awaited<ReturnType<typeof m.recuperaESalvaLightReport>> = null;
    if (rep) {
      lightReport = await m.recuperaESalvaLightReport(rep, ctx);
      errori.push(...lightReport.errori);
    }

    return {
      light_report_recuperato: lightReport?.xml_ok ?? false,
      nuovo_collegamento: !esistente,
      id_soggetto: idSoggetto,
      denominazione_cerved: denominazione,
      profilo_ok: p.esito === "ok",
      score_ok: s.esito === "ok",
      bilanci_ok: bilanciOk,
      eventi_ok: ev.esito === "ok",
      errori,
    };
  });

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Report Light Report ancora valido (scade_il > adesso) del cliente, il più recente. */
async function reportValido(admin: Admin, clienteId: string) {
  const { data, error } = await admin.from("cerved_report")
    .select("id, cliente_id, id_soggetto, request_id, scade_il")
    .eq("cliente_id", clienteId).gt("scade_il", new Date().toISOString())
    .order("scade_il", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Impossibile leggere il report Cerved del cliente");
  return data ? { ...data, id_soggetto: Number(data.id_soggetto) } : null;
}

/** "AAAA-MM-GG…" → "GG/MM/AAAA" (solo stringa). */
const dataIt = (iso: string) => { const [a, m, g] = iso.slice(0, 10).split("-"); return `${g}/${m}/${a}`; };

/**
 * Acquisto del Light Report (una volta l'anno). Blocco anti doppio acquisto: con un
 * report valido non acquista. Permesso: auth_puo_aggiornare_cerved() (gemello puoAggiornareCerved).
 */
export const acquistaReportCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di acquistare il report Cerved");

    const { data: cli } = await context.supabase
      .from("clienti").select("id, partita_iva, codice_gestionale").eq("id", data.clienteId).maybeSingle();
    if (!cli) throw new Error("Cliente non trovato");

    const m = await import("./cerved.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const utente = context.userId;
    const ctx = { utenteId: utente, clienteId: cli.id };

    const attivo = await reportValido(supabaseAdmin, cli.id);
    if (attivo) {
      return { acquistato: false, messaggio: `Report già attivo fino al ${dataIt(attivo.scade_il)}`, scade_il: attivo.scade_il, errori: [] as string[] };
    }

    // Soggetto: collegamento esistente o ricerca per P.IVA (e collegamento).
    const { data: link, error: errLink } = await supabaseAdmin
      .from("cerved_soggetti").select("id_soggetto").eq("cliente_id", cli.id).maybeSingle();
    if (errLink) throw new Error("Impossibile leggere il collegamento Cerved del cliente");
    let idSoggetto: number;
    if (link) {
      idSoggetto = Number(link.id_soggetto);
    } else {
      const piva = String(cli.partita_iva ?? "").replace(/\D/g, "");
      if (piva.length !== 11) throw new Error("Il cliente non ha una partita IVA valida: il collegamento a Cerved avviene tramite partita IVA");
      const r = await m.cercaSoggettoPerPiva(piva, ctx);
      if (r.esito !== "ok") throw new Error(r.errore ?? "Ricerca su Cerved non riuscita");
      const scelta = m.scegliAziendaPerPiva(r.risposta, piva);
      const norm = scelta ? m.normalizzaAziendaCerved(scelta) : null;
      const id = Number(norm?.id_soggetto);
      if (!norm?.id_soggetto || !Number.isFinite(id)) throw new Error("Nessuna azienda trovata su Cerved con questa partita IVA");
      idSoggetto = id;
      const ora = new Date().toISOString();
      const { error } = await supabaseAdmin.from("cerved_soggetti").insert({
        cliente_id: cli.id, id_soggetto: id, partita_iva: piva, denominazione_cerved: norm.denominazione,
        collegato_da: utente, ultimo_aggiornamento: ora, aggiornato_da: utente,
      });
      if (error) throw new Error("Impossibile salvare il collegamento Cerved del cliente");
      await supabaseAdmin.from("cerved_fotografie").insert({
        cliente_id: cli.id, id_soggetto: id, tipo: "ricerca", dati: norm as never, chiamata_id: r.chiamata_id, letta_da: utente,
      });
    }

    const acq = await m.acquistaLightReport(String(idSoggetto), "XML", cli.codice_gestionale ?? null, ctx);
    if (acq.esito !== "ok" || !acq.request_id) throw new Error(acq.errore ?? "Acquisto Cerved senza numero richiesta");

    const acquistatoIl = new Date();
    const scade = new Date(acquistatoIl);
    scade.setUTCFullYear(scade.getUTCFullYear() + 1);
    // Cerved può restituire lo stesso request_id per lo stesso soggetto: si rinnova la riga esistente.
    const { data: riga, error: errIns } = await supabaseAdmin.from("cerved_report").upsert({
      cliente_id: cli.id, id_soggetto: idSoggetto, request_id: acq.request_id, prodotto: m.PRODOTTO_LIGHT_REPORT,
      acquistato_il: acquistatoIl.toISOString(), scade_il: scade.toISOString(), acquistato_da: utente,
      chiamata_acquisto_id: acq.chiamata_id,
    }, { onConflict: "request_id" }).select("id, cliente_id, id_soggetto, request_id, scade_il").single();
    if (errIns || !riga) {
      console.error("[cerved] cerved_report non salvato", errIns?.message);
      throw new Error(`Report acquistato (numero richiesta ${acq.request_id}) ma non registrato: avvisa l'amministratore`);
    }

    const rec = await m.recuperaESalvaLightReport({ ...riga, id_soggetto: Number(riga.id_soggetto) }, ctx);
    return { acquistato: true, messaggio: `Report attivo fino al ${dataIt(riga.scade_il)}`, scade_il: riga.scade_il, errori: rec.errori };
  });

/**
 * URL firmato (10 minuti) del PDF del Light Report. Chi vede il cliente (RLS su clienti e
 * cerved_report) e ha il permesso Cerved: in FM57 non esiste una regola PDF distinta,
 * si usa quella di "Collega / Aggiorna" (auth_puo_aggiornare_cerved).
 */
export const apriPdfReportCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di aprire il report Cerved");
    const { data: cli } = await context.supabase.from("clienti").select("id").eq("id", data.clienteId).maybeSingle();
    if (!cli) throw new Error("Cliente non trovato");
    const { data: rep, error } = await context.supabase.from("cerved_report")
      .select("percorso_pdf").eq("cliente_id", cli.id).not("percorso_pdf", "is", null)
      .order("scade_il", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Impossibile leggere il report Cerved del cliente");
    if (!rep?.percorso_pdf) throw new Error("PDF del report non ancora disponibile");
    const m = await import("./cerved.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: firmato, error: eUrl } = await supabaseAdmin.storage.from(m.BUCKET_REPORT_CERVED).createSignedUrl(rep.percorso_pdf, 600);
    if (eUrl || !firmato?.signedUrl) throw new Error("Impossibile aprire il PDF del report");
    return { url: firmato.signedUrl };
  });
