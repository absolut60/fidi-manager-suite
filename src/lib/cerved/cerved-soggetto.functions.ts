import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { colonnaEntitaCerved, filtroEntitaCerved, NOME_ENTITA_CERVED, pivaCifre, type EntitaCerved } from "./cerved-entita";

type ContestoUtente = { userId: string; supabase: any };

const schemaEntita = z.object({ entita: z.enum(["cliente", "lead"]), id: z.string().uuid() });

/**
 * Unico percorso "Collega / Aggiorna Cerved" per cliente e lead (FM90).
 * Il dato appartiene al soggetto (id_soggetto): un nuovo collegamento riusa l'id_soggetto di
 * un collegamento esistente con la stessa partita IVA prima di cercare su Cerved; il blocco anti
 * doppio acquisto è per soggetto (un Light Report l'anno, chiunque l'abbia originato).
 * Permesso: public.auth_puo_aggiornare_cerved() (gemello puoAggiornareCerved).
 */
export async function eseguiAggiornaCervedSoggetto(entita: EntitaCerved, idEntita: string, context: ContestoUtente) {
  const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
  if (errPerm || !puo) throw new Error("Non hai il permesso di aggiornare i dati Cerved");

  const nome = NOME_ENTITA_CERVED[entita];
  const { data: rec } = await context.supabase
    .from(entita === "cliente" ? "clienti" : "lead")
    .select(entita === "cliente" ? "id, ragione_sociale, partita_iva, codice_gestionale" : "id, ragione_sociale, partita_iva")
    .eq("id", idEntita).maybeSingle();
  if (!rec) throw new Error(`${nome} non trovato`);

  const piva = pivaCifre(rec.partita_iva);
  if (piva.length !== 11) {
    throw new Error(`Il ${nome.toLowerCase()} non ha una partita IVA valida: il collegamento a Cerved avviene tramite partita IVA`);
  }

  const m = await import("./cerved.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const utente = context.userId;
  const clienteId = entita === "cliente" ? (rec.id as string) : null;
  const origine = filtroEntitaCerved(entita, rec.id as string);
  const colonna = colonnaEntitaCerved(entita);
  const ctx = { utenteId: utente, clienteId };

  const { data: esistente, error: errLink } = await supabaseAdmin
    .from("cerved_soggetti").select("id_soggetto, denominazione_cerved").eq(colonna, rec.id).maybeSingle();
  if (errLink) throw new Error(`Impossibile leggere il collegamento Cerved del ${nome.toLowerCase()}`);

  let idSoggetto: number;
  let denominazione: string | null = esistente?.denominazione_cerved ?? null;
  let ricerca: null | { dati: ReturnType<typeof m.normalizzaAziendaCerved>; chiamata_id: string | null } = null;

  if (esistente) {
    idSoggetto = Number(esistente.id_soggetto);
  } else {
    // Stessa partita IVA già collegata (a un altro cliente o lead): riuso senza chiamare Cerved.
    const { data: gemello, error: errGemello } = await supabaseAdmin
      .from("cerved_soggetti").select("id_soggetto, denominazione_cerved").eq("partita_iva", piva).limit(1).maybeSingle();
    if (errGemello) throw new Error("Impossibile leggere i collegamenti Cerved esistenti");
    if (gemello) {
      idSoggetto = Number(gemello.id_soggetto);
      denominazione = gemello.denominazione_cerved ?? null;
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
  }

  const ora = new Date().toISOString();
  if (esistente) {
    const { error } = await supabaseAdmin.from("cerved_soggetti")
      .update({ ultimo_aggiornamento: ora, aggiornato_da: utente }).eq(colonna, rec.id);
    if (error) throw new Error(`Impossibile salvare l'aggiornamento Cerved del ${nome.toLowerCase()}`);
  } else {
    const { error } = await supabaseAdmin.from("cerved_soggetti").insert({
      ...origine, id_soggetto: idSoggetto, partita_iva: piva, denominazione_cerved: denominazione,
      collegato_da: utente, ultimo_aggiornamento: ora, aggiornato_da: utente,
    });
    if (error) throw new Error(`Impossibile salvare il collegamento Cerved del ${nome.toLowerCase()}`);
  }

  const errori: string[] = [];
  if (ricerca) {
    const { error } = await supabaseAdmin.from("cerved_fotografie").insert([{
      ...origine, id_soggetto: idSoggetto, tipo: "ricerca", dati: ricerca.dati as never,
      chiamata_id: ricerca.chiamata_id, letta_da: utente,
    }]);
    if (error) {
      console.error("[cerved] fotografie non salvate", error.message);
      errori.push("Non è stato possibile salvare i dati Cerved letti");
    }
  }

  // Light Report: con un report valido del soggetto solo recupero gratuito; altrimenti acquisto annuale e recupero.
  let rep = await reportValido(supabaseAdmin, idSoggetto);
  let lightReportAcquistato = false;
  if (!rep) {
    try {
      const reference = entita === "cliente" ? (rec.codice_gestionale ?? null) : null;
      rep = await acquistaERegistraLightReport(supabaseAdmin, m, origine, idSoggetto, reference, utente, ctx);
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
    errori,
  };
}

export const aggiornaCervedSoggetto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entita: EntitaCerved; id: string }) => schemaEntita.parse(d))
  .handler(async ({ data, context }) => eseguiAggiornaCervedSoggetto(data.entita, data.id, context));

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Report Light Report ancora valido (scade_il > adesso) del SOGGETTO, il più recente. */
async function reportValido(admin: Admin, idSoggetto: number) {
  const { data, error } = await admin.from("cerved_report")
    .select("id, cliente_id, lead_id, id_soggetto, request_id, scade_il")
    .eq("id_soggetto", idSoggetto).gt("scade_il", new Date().toISOString())
    .order("scade_il", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Impossibile leggere il report Cerved del soggetto");
  return data ? { ...data, id_soggetto: Number(data.id_soggetto) } : null;
}

type ServerCerved = typeof import("./cerved.server");

/** Acquisto del Light Report (una volta l'anno per soggetto) e registrazione in cerved_report. */
async function acquistaERegistraLightReport(
  admin: Admin, m: ServerCerved, origine: { cliente_id: string | null; lead_id: string | null },
  idSoggetto: number, reference: string | null, utente: string, ctx: { utenteId: string; clienteId: string | null },
) {
  const acq = await m.acquistaLightReport(String(idSoggetto), "XML", reference, ctx);
  if (acq.esito !== "ok" || !acq.request_id) throw new Error(acq.errore ?? "acquisto Cerved senza numero richiesta");
  const acquistatoIl = new Date();
  const risposta = acq.risposta as { content?: unknown; detailed_delivery_status?: string } | null;
  const consegnato = typeof risposta?.content === "string" && risposta.content.length > 0;
  const scade = new Date(acquistatoIl);
  scade.setUTCFullYear(scade.getUTCFullYear() + 1);
  // Cerved può restituire lo stesso request_id per lo stesso soggetto: si rinnova la riga esistente.
  const { data: riga, error } = await admin.from("cerved_report").upsert({
    ...origine, id_soggetto: idSoggetto, request_id: acq.request_id, prodotto: m.PRODOTTO_LIGHT_REPORT,
    acquistato_il: acquistatoIl.toISOString(), scade_il: scade.toISOString(), acquistato_da: utente,
    chiamata_acquisto_id: acq.chiamata_id,
    stato: consegnato ? "consegnato" : "in_attesa",
    ultimo_esito_cerved: risposta?.detailed_delivery_status ?? null,
  }, { onConflict: "request_id" }).select("id, cliente_id, lead_id, id_soggetto, request_id, scade_il").single();
  if (error || !riga) {
    console.error("[cerved] cerved_report non salvato", error?.message);
    throw new Error(`report acquistato (numero richiesta ${acq.request_id}) ma non registrato: avvisa l'amministratore`);
  }
  return { ...riga, id_soggetto: Number(riga.id_soggetto) };
}

/**
 * URL firmato (10 minuti) del PDF del Light Report del soggetto collegato all'entità.
 * Chi vede l'entità (RLS) e ha il permesso Cerved (auth_puo_aggiornare_cerved).
 */
export async function eseguiApriPdfReportCerved(entita: EntitaCerved, idEntita: string, context: ContestoUtente) {
  const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
  if (errPerm || !puo) throw new Error("Non hai il permesso di aprire il report Cerved");
  const nome = NOME_ENTITA_CERVED[entita];
  const { data: rec } = await context.supabase.from(entita === "cliente" ? "clienti" : "lead")
    .select("id").eq("id", idEntita).maybeSingle();
  if (!rec) throw new Error(`${nome} non trovato`);
  const { data: link, error: eLink } = await context.supabase.from("cerved_soggetti")
    .select("id_soggetto").eq(colonnaEntitaCerved(entita), rec.id).maybeSingle();
  if (eLink) throw new Error(`Impossibile leggere il report Cerved del ${nome.toLowerCase()}`);
  if (!link) throw new Error("PDF del report non ancora disponibile");
  const { data: rep, error } = await context.supabase.from("cerved_report")
    .select("percorso_pdf").eq("id_soggetto", link.id_soggetto).not("percorso_pdf", "is", null)
    .order("scade_il", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Impossibile leggere il report Cerved del ${nome.toLowerCase()}`);
  if (!rep?.percorso_pdf) throw new Error("PDF del report non ancora disponibile");
  const m = await import("./cerved.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: firmato, error: eUrl } = await supabaseAdmin.storage.from(m.BUCKET_REPORT_CERVED).createSignedUrl(rep.percorso_pdf, 600);
  if (eUrl || !firmato?.signedUrl) throw new Error("Impossibile aprire il PDF del report");
  return { url: firmato.signedUrl as string };
}

export const apriPdfReportCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entita: EntitaCerved; id: string }) => schemaEntita.parse(d))
  .handler(async ({ data, context }) => eseguiApriPdfReportCerved(data.entita, data.id, context));
