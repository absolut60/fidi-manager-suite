import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Collega (se serve) un cliente al suo soggetto Cerved e salva profilo e score
 * come nuove fotografie. Unico percorso del Light Report: senza un report valido lo acquista
 * (una volta l'anno, blocco anti doppio acquisto), poi lo recupera; con un report valido solo recupero gratuito.
 * Permesso: public.auth_puo_aggiornare_cerved() (gemello puoAggiornareCerved).
 */
export const aggiornaCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di aggiornare i dati Cerved");

    const { data: cli } = await context.supabase
      .from("clienti").select("id, ragione_sociale, partita_iva, codice_gestionale").eq("id", data.clienteId).maybeSingle();
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

    // Light Report: con un report valido solo recupero gratuito (request_id); altrimenti acquisto annuale e recupero.
    let rep = await reportValido(supabaseAdmin, cli.id);
    let lightReportAcquistato = false;
    if (!rep) {
      try {
        rep = await acquistaERegistraLightReport(supabaseAdmin, m, cli.id, idSoggetto, cli.codice_gestionale ?? null, utente, ctx);
        lightReportAcquistato = true;
      } catch (e) {
        errori.push(`Light Report: ${(e as Error).message}`);
      }
    }
    let lightReport: null | Awaited<ReturnType<typeof m.recuperaESalvaLightReport>> = null;
    if (rep) {
      lightReport = await m.recuperaESalvaLightReport(rep, ctx);
      errori.push(...lightReport.errori);
    }

    return {
      light_report_recuperato: lightReport?.xml_ok ?? false,
      light_report_acquistato: lightReportAcquistato,
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

type ServerCerved = typeof import("./cerved.server");

/**
 * Acquisto del Light Report (una volta l'anno) e registrazione in cerved_report.
 * Il chiamante verifica prima reportValido (blocco anti doppio acquisto).
 */
async function acquistaERegistraLightReport(
  admin: Admin, m: ServerCerved, clienteId: string, idSoggetto: number, codiceGestionale: string | null,
  utente: string, ctx: { utenteId: string; clienteId: string },
) {
  const acq = await m.acquistaLightReport(String(idSoggetto), "XML", codiceGestionale, ctx);
  if (acq.esito !== "ok" || !acq.request_id) throw new Error(acq.errore ?? "acquisto Cerved senza numero richiesta");
  const acquistatoIl = new Date();
  const scade = new Date(acquistatoIl);
  scade.setUTCFullYear(scade.getUTCFullYear() + 1);
  // Cerved può restituire lo stesso request_id per lo stesso soggetto: si rinnova la riga esistente.
  const { data: riga, error } = await admin.from("cerved_report").upsert({
    cliente_id: clienteId, id_soggetto: idSoggetto, request_id: acq.request_id, prodotto: m.PRODOTTO_LIGHT_REPORT,
    acquistato_il: acquistatoIl.toISOString(), scade_il: scade.toISOString(), acquistato_da: utente,
    chiamata_acquisto_id: acq.chiamata_id,
  }, { onConflict: "request_id" }).select("id, cliente_id, id_soggetto, request_id, scade_il").single();
  if (error || !riga) {
    console.error("[cerved] cerved_report non salvato", error?.message);
    throw new Error(`report acquistato (numero richiesta ${acq.request_id}) ma non registrato: avvisa l'amministratore`);
  }
  return { ...riga, id_soggetto: Number(riga.id_soggetto) };
}

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
